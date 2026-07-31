import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompanyType, InvitationStatus, Prisma, Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const companySelect = {
  id: true,
  name: true,
  type: true,
  phone: true,
  address: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanySelect;

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  create(
    data: { name: string; type: CompanyType },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.company.create({
      data: {
        name: data.name,
        type: data.type,
      },
      select: companySelect,
    });
  }

  async getMyCompany(user: AuthUser) {
    const companyId = this.requireCompanyId(user);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: companySelect,
    });
    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }
    return company;
  }

  async updateMyCompany(user: AuthUser, dto: UpdateCompanyDto) {
    this.requireOwner(user);
    const companyId = this.requireCompanyId(user);

    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.address !== undefined
          ? { address: dto.address.trim() || null }
          : {}),
        ...(dto.timezone !== undefined
          ? { timezone: dto.timezone.trim() }
          : {}),
      },
      select: companySelect,
    });
  }

  async listMembers(user: AuthUser) {
    const companyId = this.requireCompanyId(user);
    return this.prisma.user.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listInvitations(user: AuthUser) {
    this.requireOwner(user);
    const companyId = this.requireCompanyId(user);

    await this.expirePending(companyId);

    return this.prisma.companyInvitation.findMany({
      where: {
        companyId,
        status: { in: [InvitationStatus.PENDING, InvitationStatus.EXPIRED] },
      },
      select: {
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvitation(user: AuthUser, dto: CreateInvitationDto) {
    this.requireOwner(user);
    const companyId = this.requireCompanyId(user);
    const email = dto.email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, companyId: true },
    });

    if (existingUser) {
      if (existingUser.companyId === companyId) {
        throw new ConflictException('Este usuario ya pertenece a tu empresa');
      }
      throw new ConflictException(
        'Este correo ya está registrado en la plataforma',
      );
    }

    const pending = await this.prisma.companyInvitation.findFirst({
      where: {
        companyId,
        email,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });

    if (pending) {
      throw new ConflictException(
        'Ya existe una invitación pendiente para este correo',
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.companyInvitation.create({
      data: {
        email,
        tokenHash,
        companyId,
        invitedById: user.id,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    const appUrl =
      this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    const acceptUrl = `${appUrl}/invite/${rawToken}`;

    await this.mail.sendInvitationEmail({
      to: email,
      companyName: company.name,
      acceptUrl,
    });

    return {
      invitation,
      // Solo en desarrollo sin SMTP: útil para pruebas
      acceptUrl: process.env.NODE_ENV === 'production' ? undefined : acceptUrl,
    };
  }

  async revokeInvitation(user: AuthUser, invitationId: string) {
    this.requireOwner(user);
    const companyId = this.requireCompanyId(user);

    const invitation = await this.prisma.companyInvitation.findFirst({
      where: { id: invitationId, companyId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitación no encontrada');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        'Solo se pueden revocar invitaciones pendientes',
      );
    }

    return this.prisma.companyInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.REVOKED },
      select: {
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async getInvitationByToken(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const invitation = await this.prisma.companyInvitation.findUnique({
      where: { tokenHash },
      include: {
        company: { select: { id: true, name: true, type: true } },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitación no válida');
    }

    if (
      invitation.status === InvitationStatus.PENDING &&
      invitation.expiresAt.getTime() < Date.now()
    ) {
      await this.prisma.companyInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new BadRequestException('La invitación ha expirado');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('La invitación ya no está disponible');
    }

    return {
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      company: invitation.company,
    };
  }

  async acceptInvitation(params: {
    rawToken: string;
    name: string;
    passwordHash: string;
  }) {
    const tokenHash = this.hashToken(params.rawToken);

    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.companyInvitation.findUnique({
        where: { tokenHash },
        include: {
          company: {
            select: { id: true, name: true, type: true },
          },
        },
      });

      if (!invitation) {
        throw new NotFoundException('Invitación no válida');
      }

      if (
        invitation.status !== InvitationStatus.PENDING ||
        invitation.expiresAt.getTime() < Date.now()
      ) {
        if (
          invitation.status === InvitationStatus.PENDING &&
          invitation.expiresAt.getTime() < Date.now()
        ) {
          await tx.companyInvitation.update({
            where: { id: invitation.id },
            data: { status: InvitationStatus.EXPIRED },
          });
        }
        throw new BadRequestException('La invitación ya no está disponible');
      }

      const existing = await tx.user.findUnique({
        where: { email: invitation.email },
      });
      if (existing) {
        throw new ConflictException('Este correo ya está registrado');
      }

      const user = await tx.user.create({
        data: {
          email: invitation.email,
          name: params.name.trim(),
          passwordHash: params.passwordHash,
          role: Role.MEMBER,
          companyId: invitation.companyId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          companyId: true,
          createdAt: true,
          company: {
            select: { id: true, name: true, type: true },
          },
        },
      });

      await tx.companyInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED },
      });

      return user;
    });
  }

  private async expirePending(companyId: string) {
    await this.prisma.companyInvitation.updateMany({
      where: {
        companyId,
        status: InvitationStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: InvitationStatus.EXPIRED },
    });
  }

  private requireCompanyId(user: AuthUser) {
    if (!user.companyId) {
      throw new ForbiddenException('No perteneces a ninguna empresa');
    }
    return user.companyId;
  }

  private requireOwner(user: AuthUser) {
    if (user.role !== Role.OWNER) {
      throw new ForbiddenException(
        'Solo el dueño de la empresa puede hacer esto',
      );
    }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
