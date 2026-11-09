import logging
import os
import threading
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

logger = logging.getLogger(__name__)

MODEL_ID = "google/gemma-2-2b-it"

tokenizer = None
model = None
_load_lock = threading.Lock()
_is_loading = False
_load_error = None


def init_gemma_model():
    """Background loader: Uses local host cache first, falls back to downloading if missing."""
    global tokenizer, model, _is_loading, _load_error

    if model is not None and tokenizer is not None:
        return

    with _load_lock:
        if model is not None or _is_loading:
            return
        _is_loading = True
        _load_error = None

    hf_token = os.getenv("HF_TOKEN")

    try:
        logger.info("Attempting local cache load for model '%s'...", MODEL_ID)
        try:
            tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, local_files_only=True)
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_ID,
                dtype=torch.float32,
                device_map=None,
                local_files_only=True,
            )
            logger.info("Model '%s' loaded successfully from local host cache.", MODEL_ID)
        except Exception as cache_err:
            logger.warning(
                "Local host cache load failed (%s). Downloading model via HF_TOKEN...",
                str(cache_err),
            )
            tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=hf_token)
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_ID,
                dtype=torch.float32,
                device_map=None,
                token=hf_token,
            )
            logger.info("Model '%s' downloaded and initialized successfully.", MODEL_ID)
    except Exception as err:
        _load_error = str(err)
        logger.error("Failed to initialize Gemma 2 (2B): %s", _load_error, exc_info=True)
    finally:
        _is_loading = False


def generate_gemma_response(system_prompt: str, user_prompt: str, max_tokens: int = 256) -> str:
    """Executes inference using Gemma 2's native chat format."""
    global tokenizer, model, _is_loading, _load_error

    if model is None or tokenizer is None:
        if _is_loading:
            return "Gemma 2 (2B) is currently loading into memory. Please wait a few moments and try again."
        if _load_error:
            return f"Gemma 2 initialization error: {_load_error}. Check your HF_TOKEN and permissions."

        init_gemma_model()

        if model is None or tokenizer is None:
            return f"Gemma 2 model is not ready ({_load_error or 'Unknown error'}). Check backend logs."

    messages = [{"role": "user", "content": f"{system_prompt}\n\n{user_prompt}"}]
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

    return tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True).strip()