"""
KrishiMitra offline knowledge base: fallback remedies, MSP rates, schemes, heuristics.
Starter data - extend it, and verify MSP figures against the latest official
Govt. of India (CACP / DA&FW) notification before showing them to farmers.
"""

# ---- Minimum Support Prices (Rs per quintal). Update each season. ----
MSP_RATES = {
    "paddy": 2369, "wheat": 2585, "maize": 2400, "bajra": 2775,
    "tur": 8000, "moong": 8768, "urad": 7800, "groundnut": 7263,
    "soybean": 5328, "cotton": 7710, "gram": 5875, "mustard": 6200,
}

MANDI_NOTE = "Offline indicative prices, not live. Check your local APMC / eNAM for today's rate."

# Illustrative modal prices (Rs/quintal) - REPLACE with live AGMARKNET data when online.
_SAMPLE_MANDI = [
    {"crop": "paddy", "market": "Sample Mandi", "state": "Tamil Nadu", "modal_price": 2300},
    {"crop": "wheat", "market": "Sample Mandi", "state": "Punjab", "modal_price": 2650},
    {"crop": "groundnut", "market": "Sample Mandi", "state": "Maharashtra", "modal_price": 6900},
    {"crop": "cotton", "market": "Sample Mandi", "state": "Telangana", "modal_price": 7400},
]


def mandi_with_msp(crop: str = "", state: str = "") -> list[dict]:
    out = []
    for row in _SAMPLE_MANDI:
        if crop and crop.lower() not in row["crop"]:
            continue
        if state and state.lower() != row["state"].lower():
            continue
        msp = MSP_RATES.get(row["crop"])
        out.append({**row, "msp": msp,
                    "above_msp": (row["modal_price"] >= msp) if msp else None,
                    "gap": (row["modal_price"] - msp) if msp else None})
    return out


# ---- Disease remedies (offline fallback). Keys are lowercase crop names. ----
DISEASES = {
    "paddy": {
        "disease": "Possible blast or brown spot (check leaf spots)",
        "symptoms": ["Diamond/eye-shaped grey spots with brown edges", "Leaves dry from the tip"],
        "organic_remedy": ["Spray 5% neem seed kernel extract", "Avoid excess nitrogen"],
        "chemical_remedy": ["Use a locally recommended fungicide (e.g. tricyclazole) as per label dose"],
        "prevention": ["Use resistant varieties", "Treat seed before sowing", "Drain field water periodically"],
    },
    "tomato": {
        "disease": "Possible early/late blight",
        "symptoms": ["Dark spots with rings on older leaves", "Fruit rot in humid weather"],
        "organic_remedy": ["Remove infected leaves", "Spray 1% Bordeaux mixture or neem oil"],
        "chemical_remedy": ["Mancozeb as per label dose"],
        "prevention": ["Rotate crops", "Stake plants for airflow", "Avoid overhead watering"],
    },
    "cotton": {
        "disease": "Possible leaf curl virus (whitefly spread)",
        "symptoms": ["Upward curling leaves", "Stunted growth"],
        "organic_remedy": ["Yellow sticky traps", "Neem oil spray to cut whitefly"],
        "chemical_remedy": ["Consult KVK for a whitefly-specific insecticide"],
        "prevention": ["Uproot infected plants early", "Control weeds around the field"],
    },
}

GENERIC_DIAGNOSIS = {
    "disease": "Unknown - cannot identify offline",
    "symptoms": [], "organic_remedy": ["Remove badly affected leaves", "Spray neem oil (5 ml per litre water)"],
    "chemical_remedy": [], "prevention": ["Show the plant to your nearest KVK / agriculture officer"],
}


def fallback_diagnosis(crop_hint: str = "") -> dict:
    entry = DISEASES.get((crop_hint or "").strip().lower(), GENERIC_DIAGNOSIS)
    return {"crop": crop_hint or "unknown", "confidence": "low", "severity": "unknown", "healthy": False,
            **entry, "disclaimer": "Offline guess only. Confirm with your KVK before spraying."}


# ---- Keyword-based chat fallback (English; extend per language as needed) ----
_CHAT_RULES = [
    (("price", "mandi", "rate", "msp"), "fallback_price", "Check the Mandi tab for MSP and market rates. Sell above MSP, or use eNAM / government procurement."),
    (("rain", "weather", "spray"), "fallback_weather", "Spray only in calm, dry weather: wind under 15 km/h, no rain for 24 hours, early morning or evening. See the Weather tab."),
    (("scheme", "subsidy", "loan", "insurance"), "fallback_scheme", "See the Schemes tab: PM-KISAN, PM Fasal Bima Yojana and Kisan Credit Card are good starting points."),
    (("pest", "insect", "worm"), "fallback_pest", "Try neem oil (5 ml/litre), pheromone traps and removing affected plants first. Ask your KVK before using chemicals."),
    (("fertili", "urea", "soil"), "fallback_soil", "Get a Soil Health Card test and apply fertiliser by its recommendation - it saves money and protects soil."),
]


def fallback_chat_reply(message: str, lang: str = "en") -> str:
    text = message.lower()
    for keys, _, reply in _CHAT_RULES:
        if any(k in text for k in keys):
            return reply
    return "I'm offline right now. Please try again when connected, or contact your nearest Krishi Vigyan Kendra (KVK)."


def fallback_chat_reply_key(message: str) -> str:
    text = message.lower()
    for keys, key, _ in _CHAT_RULES:
        if any(k in text for k in keys):
            return key
    return "fallback_offline"


# ---- Schemes catalogue (verify details on official portals) ----
SCHEMES = [
    {"id": "pm_kisan", "name": "PM-KISAN", "level": "central", "benefit": "Rs 6,000 per year in three instalments for eligible farmer families", "link": "https://pmkisan.gov.in"},
    {"id": "pm_fas_bima_yojana", "name": "PM Fasal Bima Yojana (PMFBY)", "level": "central", "benefit": "Crop insurance against yield loss from weather, pests and disease", "link": "https://pmfby.gov.in"},
    {"id": "kisan_credit_card", "name": "Kisan Credit Card (KCC)", "level": "central", "benefit": "Short-term farm credit at concessional interest", "link": "https://www.myscheme.gov.in"},
    {"id": "soil_health_card", "name": "Soil Health Card", "level": "central", "benefit": "Free soil test with fertiliser recommendations", "link": "https://soilhealth.dac.gov.in"},
    {"id": "pm_kusum", "name": "PM-KUSUM", "level": "central", "benefit": "Subsidy for solar pumps and solarising farm power", "link": "https://pmkusum.mnre.gov.in"},
    {"id": "enam", "name": "eNAM", "level": "central", "benefit": "Online national market to sell produce at competitive prices", "link": "https://enam.gov.in"},
]


def get_schemes(state: str = "") -> list[dict]:
    # State-specific schemes can be added with {"level": "state", "state": "Punjab", ...}
    return [s for s in SCHEMES if s["level"] == "central" or s.get("state", "").lower() == state.lower()]
