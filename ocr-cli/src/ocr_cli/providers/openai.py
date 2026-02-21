"""OpenAI GPT-4o vision provider."""

import base64
from typing import Any

from openai import OpenAI

from ocr_cli.providers.base import BaseProvider
from ocr_cli.prompt import HANDWRITTEN_NOTES_PROMPT

SYSTEM_PROMPT = HANDWRITTEN_NOTES_PROMPT


class OpenAIProvider(BaseProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def ocr(self, images: list[bytes], output_format: str = "markdown") -> str:
        content: list[Any] = []

        for i, img_bytes in enumerate(images):
            if len(images) > 1:
                content.append({"type": "text", "text": f"[Page {i + 1}]"})
            b64 = base64.standard_b64encode(img_bytes).decode("utf-8")
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{b64}",
                    "detail": "high",
                },
            })

        content.append({
            "type": "text",
            "text": f"OCR all content above. Output format: {output_format}.",
        })

        response = self.client.chat.completions.create(
            model=self.model,
            max_tokens=4096,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": content},
            ],
        )

        return response.choices[0].message.content or ""
