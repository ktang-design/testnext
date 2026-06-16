import os
import requests
from wcag_contrast_ratio import contrast

# Read the Figma token from the environment — never hard-code secrets.
#   export FIGMA_TOKEN="<your-figma-personal-access-token>"   (then run the script)
FIGMA_TOKEN = os.environ.get("FIGMA_TOKEN")
if not FIGMA_TOKEN:
    raise SystemExit("Set the FIGMA_TOKEN environment variable before running.")
FILE_KEY = "pvaBhwOOFEKIEL8DTu7oLQ"
NODE_ID = "0-1"
BACKGROUND_COLOR = {"r": 1, "g": 1, "b": 1}  # white background

headers = {"X-Figma-Token": FIGMA_TOKEN}
url = f"https://api.figma.com/v1/files/{FILE_KEY}/nodes?ids={NODE_ID}"
response = requests.get(url, headers=headers)
data = response.json()

def srgb(color):
    """Convert Figma 0-1 color to 0-255 tuple"""
    return tuple(round(color[c] * 255) for c in ("r", "g", "b"))

def check_text_nodes(node):
    """Recursively check text nodes and print only contrast results"""
    if node.get("type") == "TEXT":
        fills = node.get("fills", [])
        if fills:
            for fill in fills:
                if fill.get("type") == "SOLID" and fill.get("color"):
                    ratio = contrast(srgb(fill["color"]), srgb(BACKGROUND_COLOR))
                    status = "✅ Passes WCAG AA" if ratio >= 4.5 else "❌ Fails WCAG AA"
                    print(f"{node.get('name', 'Unnamed')}: {ratio:.2f}:1 → {status}")
                    break  # only first SOLID fill
    # Recurse children
    for child in node.get("children", []):
        check_text_nodes(child)

# Only run on the top-level node document
for node_id, node_data in data.get("nodes", {}).items():
    document = node_data.get("document")
    if document:
        check_text_nodes(document)