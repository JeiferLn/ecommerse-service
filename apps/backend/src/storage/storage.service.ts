import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

export interface UploadedObject {
  key: string;
  url: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string | null;
  private readonly publicUrl: string | null;
  private readonly localUploadDir: string;
  private readonly apiPublicUrl: string;
  private readonly apiLocalUrl: string;
  private readonly mode: "r2" | "local" | "disabled";

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>("R2_ACCOUNT_ID");
    const accessKeyId = this.configService.get<string>("R2_ACCESS_KEY_ID");
    const secretAccessKey = this.configService.get<string>("R2_SECRET_ACCESS_KEY");
    const bucket = this.configService.get<string>("R2_BUCKET");
    const publicUrl = this.configService.get<string>("R2_PUBLIC_URL");
    const port = this.configService.get<number>("PORT") ?? 4000;
    const nodeEnv = this.configService.get<string>("NODE_ENV") ?? "development";

    this.localUploadDir =
      this.configService.get<string>("LOCAL_UPLOAD_DIR")?.trim() || join(process.cwd(), "uploads");
    this.apiLocalUrl = `http://localhost:${port}`;
    this.apiPublicUrl = (
      this.configService.get<string>("API_PUBLIC_URL")?.trim() || this.apiLocalUrl
    ).replace(/\/$/, "");

    if (accountId && accessKeyId && secretAccessKey && bucket && publicUrl) {
      this.mode = "r2";
      this.bucket = bucket;
      this.publicUrl = publicUrl.replace(/\/$/, "");
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.logger.log("Almacenamiento: Cloudflare R2");
      return;
    }

    this.client = null;
    this.bucket = null;
    this.publicUrl = null;

    if (nodeEnv === "production") {
      this.mode = "disabled";
      this.logger.error(
        "R2 no configurado en production: el upload de imágenes estará deshabilitado.",
      );
      return;
    }

    this.mode = "local";
    this.logger.warn(
      `R2 no configurado: usando almacenamiento local en ${this.localUploadDir} (URL pública ${this.apiPublicUrl}/uploads/...).`,
    );
  }

  getUploadDir(): string {
    return this.localUploadDir;
  }

  isRemote(): boolean {
    return this.mode === "r2";
  }

  usesLocalDisk(): boolean {
    return this.mode === "local";
  }

  /**
   * URL para el admin. En disco local la URL guardada puede apuntar a un túnel (ngrok) que ya
   * no existe; el navegador siempre llega al API local.
   */
  browserUrl(url: string): string {
    return this.rebaseLocalUpload(url, this.apiLocalUrl);
  }

  /** URL que Twilio/WhatsApp puede descargar: en disco local, el `API_PUBLIC_URL` actual. */
  externalUrl(url: string): string {
    return this.rebaseLocalUpload(url, this.apiPublicUrl);
  }

  private rebaseLocalUpload(url: string, base: string): string {
    if (this.mode !== "local") {
      return url;
    }
    const match = /^https?:\/\/[^/]+\/uploads\/(.+)$/i.exec(url);
    return match ? `${base}/uploads/${match[1]}` : url;
  }

  async uploadProductImage(params: {
    companyId: string;
    productId: string;
    fileName: string;
    contentType: string;
    body: Buffer;
  }): Promise<UploadedObject> {
    if (this.mode === "disabled") {
      throw new ServiceUnavailableException(
        "Almacenamiento no disponible en production sin R2. Configura las variables R2_*.",
      );
    }

    const extension = extname(params.fileName).toLowerCase() || ".bin";
    const key = `companies/${params.companyId}/products/${params.productId}/${randomUUID()}${extension}`;
    return this.putObject({
      key,
      body: params.body,
      contentType: params.contentType,
    });
  }

  async uploadKnowledgePdf(params: {
    companyId: string;
    type: string;
    fileName: string;
    body: Buffer;
  }): Promise<UploadedObject> {
    if (this.mode === "disabled") {
      throw new ServiceUnavailableException(
        "Almacenamiento no disponible en production sin R2. Configura las variables R2_*.",
      );
    }

    const key = `companies/${params.companyId}/knowledge/${params.type}/${randomUUID()}.pdf`;
    return this.putObject({
      key,
      body: params.body,
      contentType: "application/pdf",
    });
  }

  private async putObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<UploadedObject> {
    if (this.mode === "r2") {
      await this.client!.send(
        new PutObjectCommand({
          Bucket: this.bucket!,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
        }),
      );
      return { key: params.key, url: `${this.publicUrl}/${params.key}` };
    }

    const filePath = join(this.localUploadDir, params.key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, params.body);
    return { key: params.key, url: `${this.apiLocalUrl}/uploads/${params.key}` };
  }

  async deleteObject(key: string): Promise<void> {
    if (this.mode === "disabled") {
      return;
    }

    if (this.mode === "r2") {
      await this.client!.send(
        new DeleteObjectCommand({
          Bucket: this.bucket!,
          Key: key,
        }),
      );
      return;
    }

    try {
      await unlink(join(this.localUploadDir, key));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }
}
