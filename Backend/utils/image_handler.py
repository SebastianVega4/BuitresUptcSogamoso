import os
import uuid
from PIL import Image
from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_optimized_image(file, upload_folder):
    """
    Saves and optimizes an uploaded image.
    Returns the filename of the saved image.
    """
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Generate unique filename to avoid collisions
        unique_filename = f"{uuid.uuid4().hex}_{filename}"
        file_path = os.path.join(upload_folder, unique_filename)

        try:
            image = Image.open(file)
            
            # Convert to RGB if necessary (e.g. for PNG with transparency being saved as JPEG)
            if image.mode in ("RGBA", "P"):
                image = image.convert("RGB")
                
            # Resize if too large (e.g. max width 1024px)
            max_width = 1024
            if image.width > max_width:
                ratio = max_width / image.width
                new_height = int(image.height * ratio)
                image = image.resize((max_width, new_height), Image.Resampling.LANCZOS)
            
            # Save with optimization
            image.save(file_path, optimize=True, quality=85)
            
            return unique_filename
        except Exception as e:
            print(f"Error processing image: {e}")
            return None
    return None
