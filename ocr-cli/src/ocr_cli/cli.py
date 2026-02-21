"""Main CLI entry point."""

import sys
from pathlib import Path

import click
from dotenv import load_dotenv
from rich.console import Console

from ocr_cli.config import Config, Provider
from ocr_cli.pdf import pdf_to_images
from ocr_cli.postprocessing import normalize_latex_delimiters
from ocr_cli.preprocessing import preprocess_for_ocr
from ocr_cli.providers.anthropic import AnthropicProvider
from ocr_cli.providers.openai import OpenAIProvider

console = Console(stderr=True)
load_dotenv()

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


@click.command()
@click.argument("input_path", type=click.Path(exists=True, path_type=Path))
@click.option(
    "--provider", "-p",
    type=click.Choice(["anthropic", "openai"], case_sensitive=False),
    default="anthropic",
    show_default=True,
    help="LLM provider to use for OCR.",
)
@click.option(
    "--model", "-m",
    default=None,
    help="Model name override (defaults to best vision model for the provider).",
)
@click.option(
    "--output", "-o",
    type=click.Path(path_type=Path),
    default=None,
    help="Output file path. Defaults to stdout.",
)
@click.option(
    "--format", "-f", "output_format",
    type=click.Choice(["markdown", "text"], case_sensitive=False),
    default="markdown",
    show_default=True,
    help="Output format.",
)
@click.option(
    "--dpi",
    default=150,
    show_default=True,
    help="DPI for PDF rendering. Higher = better quality, larger API payloads.",
)
@click.option(
    "--api-key",
    default=None,
    help="API key (overrides environment variable).",
)
@click.option(
    "--preprocess/--no-preprocess",
    default=True,
    show_default=True,
    help="Apply auto-contrast and unsharp masking before sending to the LLM.",
)
@click.version_option()
def main(input_path, provider, model, output, output_format, dpi, api_key, preprocess):
    """OCR an image or PDF using LLM vision APIs.

    INPUT_PATH can be a .pdf, .png, .jpg, .jpeg, .webp, or .gif file.
    Results are written to stdout unless --output is specified.
    """
    try:
        config = Config.from_env(
            provider=Provider(provider),
            model_override=model,
            api_key_override=api_key,
        )
    except RuntimeError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    suffix = input_path.suffix.lower()

    if suffix == ".pdf":
        with console.status("[cyan]Converting PDF to images..."):
            images = pdf_to_images(input_path, dpi=dpi, preprocess=preprocess)
        console.print(f"[dim]{len(images)} page(s) extracted[/dim]")
    elif suffix in IMAGE_EXTENSIONS:
        raw = input_path.read_bytes()
        images = [preprocess_for_ocr(raw) if preprocess else raw]
    else:
        console.print(f"[red]Unsupported file type:[/red] {suffix}")
        sys.exit(1)

    provider_obj = _build_provider(config)

    with console.status(f"[cyan]Running OCR via {provider} ({config.model})..."):
        result = provider_obj.ocr(images=images, output_format=output_format)

    if output_format == "markdown":
        result = normalize_latex_delimiters(result)

    if output:
        output.write_text(result, encoding="utf-8")
        console.print(f"[green]Written to {output}[/green]")
    else:
        click.echo(result)


def _build_provider(config: Config):
    if config.provider == Provider.ANTHROPIC:
        return AnthropicProvider(api_key=config.api_key, model=config.model)
    elif config.provider == Provider.OPENAI:
        return OpenAIProvider(api_key=config.api_key, model=config.model)
    else:
        raise ValueError(f"Unknown provider: {config.provider}")
