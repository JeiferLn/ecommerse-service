import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';

export type StoredFile = {
  url: string;
  relativePath: string;
};

@Injectable()
export class StorageService {
  private readonly uploadsRoot: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.uploadsRoot = join(process.cwd(), 'uploads');
    const appUrl =
      this.config.get<string>('API_PUBLIC_URL') ??
      `http://localhost:${this.config.get<string>('PORT') ?? '3001'}`;
    this.publicBaseUrl = appUrl.replace(/\/$/, '');
  }

  async saveProductImage(
    companyId: string,
    file: Express.Multer.File,
  ): Promise<StoredFile> {
    const folder = join(this.uploadsRoot, 'products', companyId);
    await mkdir(folder, { recursive: true });

    const extension = this.safeExtension(file.originalname, file.mimetype);
    const filename = `${randomUUID()}${extension}`;
    const absolutePath = join(folder, filename);
    await writeFile(absolutePath, file.buffer);

    const relativePath = `products/${companyId}/${filename}`;
    return {
      relativePath,
      url: `${this.publicBaseUrl}/uploads/${relativePath}`,
    };
  }

  async deleteByUrl(url: string) {
    const marker = '/uploads/';
    const index = url.indexOf(marker);
    if (index === -1) return;

    const relativePath = url.slice(index + marker.length);
    const absolutePath = join(this.uploadsRoot, relativePath);
    await unlink(absolutePath).catch(() => undefined);
  }

  private safeExtension(originalName: string, mimeType: string) {
    const fromName = extname(originalName).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromName)) {
      return fromName === '.jpeg' ? '.jpg' : fromName;
    }

    const mimeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    return mimeMap[mimeType] ?? '.jpg';
  }
}
