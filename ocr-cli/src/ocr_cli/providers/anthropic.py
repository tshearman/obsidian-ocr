"""Anthropic Claude vision provider."""

import base64
from typing import Any

import anthropic

from ocr_cli.providers.base import BaseProvider
from ocr_cli.prompt import HANDWRITTEN_NOTES_PROMPT

SYSTEM_PROMPT = HANDWRITTEN_NOTES_PROMPT


class AnthropicProvider(BaseProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def ocr(self, images: list[bytes], output_format: str = "markdown") -> str:
        content: list[Any] = []

        for i, img_bytes in enumerate(images):
            if len(images) > 1:
                content.append({"type": "text", "text": f"[Page {i + 1}]"})
            b64 = base64.standard_b64encode(img_bytes).decode("utf-8")
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": b64,
                },
            })

        content.append({
            "type": "text",
            "text": f"Please OCR all content above. Output format: {output_format}.",
        })

        response = self.client.messages.create(
            model=self.model,
            max_tokens=8192,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
        )

        return response.content[0].text
