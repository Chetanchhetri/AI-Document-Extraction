import logging
import os
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

logger = logging.getLogger(__name__)

MODEL_ID = "google/gemma-2-2b-it"

tokenizer = None
model = None


def init_gemma_model():
    """Checks local cache or downloads Gemma 2 (2B) from Hugging Face using HF_TOKEN."""
    global tokenizer, model
    if model is not None:
        return

    hf_token = os.getenv("HF_TOKEN")

    logger.info("Checking local cache for model '%s'...", MODEL_ID)
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, local_files_only=True)
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
            device_map="auto" if torch.cuda.is_available() else None,
            local_files_only=True,
        )
        logger.info("Model '%s' loaded successfully from local cache.", MODEL_ID)
    except Exception as exc:
        logger.warning(
            "Model '%s' not found locally (%s). Attempting download from Hugging Face...",
            MODEL_ID,
            str(exc),
        )
        try:
            tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=hf_token)
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_ID,
                torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
                device_map="auto" if torch.cuda.is_available() else None,
                token=hf_token,
            )
            logger.info("Model '%s' downloaded and initialized successfully.", MODEL_ID)
        except Exception as download_err:
            logger.error(
                "Failed to download Gemma 2 (2B) from Hugging Face: %s. "
                "Ensure HF_TOKEN is set in your environment and you accepted terms at https://huggingface.co/google/gemma-2-2b-it",
                str(download_err),
            )


def generate_gemma_response(system_prompt: str, user_prompt: str, max_tokens: int = 256) -> str:
    """Executes inference using Gemma 2's native chat format."""
    global tokenizer, model
    if tokenizer is None or model is None:
        init_gemma_model()

    if tokenizer is None or model is None:
        return "Gemma 2 (2B) model is not loaded. Please verify HF_TOKEN environment variable."

    messages = [
        {"role": "user", "content": f"{system_prompt}\n\n{user_prompt}"}
    ]

    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=0.2,
            top_p=0.9,
            do_sample=True,
        )

    response_text = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
    return response_text.strip()