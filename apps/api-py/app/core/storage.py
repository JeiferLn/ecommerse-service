import asyncio
import logging
import re
import uuid
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.errors import service_unavailable

logger = logging.getLogger("app.storage")

_LOCAL_UPLOAD_RE = re.compile(r"^https?://[^/]+/uploads/(.+)$", re.IGNORECASE)
_DISABLED_MESSAGE = "Almacenamiento no disponible en production sin R2. Configura las variables R2_*."
_IMAGE_EXTENSIONS = {"image/webp": ".webp", "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif"}


@dataclass(frozen=True)
class UploadedObject:
    key: str
    url: str


class StorageService:
    def __init__(self) -> None:
        settings = get_settings()
        self.local_upload_dir: Path = settings.local_upload_dir
        self.api_local_url = f"http://localhost:{settings.PORT}"
        self.api_public_url = ((settings.API_PUBLIC_URL or "").strip() or self.api_local_url).rstrip("/")
        self._client: Any = None
        self._bucket: str | None = None
        self._public_url: str | None = None

        if (
            settings.R2_ACCOUNT_ID
            and settings.R2_ACCESS_KEY_ID
            and settings.R2_SECRET_ACCESS_KEY
            and settings.R2_BUCKET
            and settings.R2_PUBLIC_URL
        ):
            import boto3

            self.mode = "r2"
            self._bucket = settings.R2_BUCKET
            self._public_url = settings.R2_PUBLIC_URL.rstrip("/")
            self._client = boto3.client(
                "s3",
                region_name="auto",
                endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
                aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            )
            logger.info("Almacenamiento: Cloudflare R2")
        elif settings.is_production:
            self.mode = "disabled"
            logger.error("R2 no configurado en production: el upload de imágenes estará deshabilitado.")
        else:
            self.mode = "local"
            logger.warning(
                "R2 no configurado: usando almacenamiento local en %s (URL pública %s/uploads/...).",
                self.local_upload_dir,
                self.api_public_url,
            )

    def uses_local_disk(self) -> bool:
        return self.mode == "local"

    def browser_url(self, url: str) -> str:
        """URL para el admin: en disco local la URL guardada puede apuntar a un túnel caído."""
        return self._rebase_local_upload(url, self.api_local_url)

    def external_url(self, url: str) -> str:
        """URL que Twilio/WhatsApp puede descargar: en disco local, el `API_PUBLIC_URL` actual."""
        return self._rebase_local_upload(url, self.api_public_url)

    def _rebase_local_upload(self, url: str, base: str) -> str:
        if self.mode != "local":
            return url
        match = _LOCAL_UPLOAD_RE.match(url)
        return f"{base}/uploads/{match.group(1)}" if match else url

    async def upload_product_image(
        self, *, company_id: str, product_id: str, content_type: str, body: bytes
    ) -> UploadedObject:
        if self.mode == "disabled":
            raise service_unavailable(_DISABLED_MESSAGE)
        extension = _IMAGE_EXTENSIONS.get(content_type, ".bin")
        key = f"companies/{company_id}/products/{product_id}/{uuid.uuid4()}{extension}"
        return await self._put_object(key=key, body=body, content_type=content_type)

    async def upload_knowledge_pdf(self, *, company_id: str, doc_type: str, body: bytes) -> UploadedObject:
        if self.mode == "disabled":
            raise service_unavailable(_DISABLED_MESSAGE)
        key = f"companies/{company_id}/knowledge/{doc_type}/{uuid.uuid4()}.pdf"
        return await self._put_object(key=key, body=body, content_type="application/pdf")

    async def _put_object(self, *, key: str, body: bytes, content_type: str) -> UploadedObject:
        if self.mode == "r2":
            await asyncio.to_thread(
                self._client.put_object, Bucket=self._bucket, Key=key, Body=body, ContentType=content_type
            )
            return UploadedObject(key=key, url=f"{self._public_url}/{key}")

        file_path = self.local_upload_dir / key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(file_path.write_bytes, body)
        return UploadedObject(key=key, url=f"{self.api_local_url}/uploads/{key}")

    async def delete_object(self, key: str) -> None:
        if self.mode == "disabled":
            return
        if self.mode == "r2":
            await asyncio.to_thread(self._client.delete_object, Bucket=self._bucket, Key=key)
            return
        (self.local_upload_dir / key).unlink(missing_ok=True)


@lru_cache
def get_storage() -> StorageService:
    return StorageService()
