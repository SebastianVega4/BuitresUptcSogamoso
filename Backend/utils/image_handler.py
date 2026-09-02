import os
import io
import uuid
from PIL import Image
from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_MIMES = {'image/png', 'image/jpeg', 'image/gif', 'image/webp'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_WIDTH = 1024
MAX_HEIGHT = 1024
OUTPUT_QUALITY = 80

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_optimized_image(file, upload_folder):
    """
    Validates, resizes, compresses and saves an uploaded image.
    Always outputs as JPEG to minimize file size.
    Returns the filename of the saved image.
    """
    if not file or not file.filename:
        return None

    if not allowed_file(file.filename):
        return None

    try:
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        if file_size > MAX_FILE_SIZE:
            return None
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
        file_path = os.path.join(upload_folder, unique_filename)

        buffer = io.BytesIO()
        image.save(buffer, format='JPEG', quality=OUTPUT_QUALITY, optimize=True)
        buffer.seek(0)

        with open(file_path, 'wb') as f:
            f.write(buffer.read())

        return unique_filename
    except Exception as e:
        print(f"Error processing image: {e}")
        return None
