# Upscaling the panels

The panels were generated at 382 × 250 and upscaled 4× with Real-ESRGAN
(the anime model, `RealESRGAN_x4plus_anime_6B`) before rendering. The
inference here runs in plain numpy — no PyTorch needed:

```bash
curl -L -o anime6B.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth
python3 esrgan_np.py anime6B.pth panel-03-small.png panel-03.png --tile 140
```

About 50 seconds per panel on two cores. Needs numpy and Pillow.
