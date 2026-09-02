import os
import io
import uuid
import boto3
from PIL import Image

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_WIDTH = 1024
MAX_HEIGHT = 1024
OUTPUT_QUALITY = 80


def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_r2_client():
    """Create and return a Cloudflare R2 (S3-compatible) client."""
    return boto3.client(
        's3',
        endpoint_url=f'https://{os.environ.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com',
        aws_access_key_id=os.environ.get('R2_ACCESS_KEY_ID'),
        aws_secret_access_key=os.environ.get('R2_SECRET_ACCESS_KEY'),
        region_name='auto',
        config=boto3.session.Config(
            s3={'addressing_style': 'path'},
            signature_version='s3v4',
        ),
    )


def optimize_image(file):
    """
    Validates, resizes, compresses an uploaded image.
    Returns (unique_filename, image_bytes) or (None, None) on failure.
    """
    if not file or not file.filename:
        return None, None

    if not allowed_file(file.filename):
        return None, None

    try:
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        if file_size > MAX_FILE_SIZE:
            return None, None
    except Exception:
        pass

    try:
        image = Image.open(file)

        if image.mode in ("RGBA", "P", "LA"):
            background = Image.new("RGB", image.size, (255, 255, 255))
            if image.mode == "P":
                image = image.convert("RGBA")
            background.paste(image, mask=image.split()[-1] if image.mode in ("RGBA", "LA") else None)
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")

        ratio = min(MAX_WIDTH / image.width, MAX_HEIGHT / image.height, 1.0)
        if ratio < 1.0:
            new_width = int(image.width * ratio)
            new_height = int(image.height * ratio)
            image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)

        unique_filename = f"{uuid.uuid4().hex}.jpg"

        buffer = io.BytesIO()
        image.save(buffer, format='JPEG', quality=OUTPUT_QUALITY, optimize=True)
        buffer.seek(0)

        return unique_filename, buffer.getvalue()
    except Exception as e:
        print(f"Error processing image: {e}")
        return None, None


def upload_to_r2(file, bucket_name=None):
    """
    Optimizes an image and uploads it to Cloudflare R2.
    Returns the public URL of the uploaded file, or None on failure.
    """
    filename, image_bytes = optimize_image(file)
    if not filename or not image_bytes:
        return None

    bucket = bucket_name or os.environ.get('R2_BUCKET_NAME', 'buitres-uploads')
    r2_public_url = os.environ.get('R2_PUBLIC_URL', '')

    try:
        client = get_r2_client()
        client.put_object(
            Bucket=bucket,
            Key=filename,
            Body=image_bytes,
            ContentType='image/jpeg',
            CacheControl='public, max-age=31536000',
        )

        if r2_public_url:
            return f"{r2_public_url}/{filename}"

        account_id = os.environ.get('R2_ACCOUNT_ID')
        return f"https://{account_id}.r2.cloudflarestorage.com/{bucket}/{filename}"
    except Exception as e:
        print(f"Error uploading to R2: {e}")
        return None
