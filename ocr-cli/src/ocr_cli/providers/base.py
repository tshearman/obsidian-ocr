"""Abstract base for LLM OCR providers."""

from abc import ABC, abstractmethod


class BaseProvider(ABC):
    @abstractmethod
    def ocr(self, images: list[bytes], output_format: str = "markdown") -> str:
        """Accept a list of image byte strings (one per page) and return OCR text."""
        ...
