"""Decode portrait uploads, correct EXIF orientation, strip metadata, bound size."""
import sys,warnings
from PIL import Image,ImageOps
warnings.simplefilter('error',Image.DecompressionBombWarning)
Image.MAX_IMAGE_PIXELS=24000000
with Image.open(sys.argv[1]) as image:
    if image.format not in ('JPEG','PNG','WEBP'):raise ValueError('Unsupported photo')
    image=ImageOps.exif_transpose(image).convert('RGB')
    image.thumbnail((1200,1200))
    image.save(sys.argv[2],'JPEG',quality=90)
