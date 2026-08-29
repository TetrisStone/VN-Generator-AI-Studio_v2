
export function getDefaultWorkflow(): any {
  return {
    "3": {
      "inputs": {
        "seed": 8566258,
        "steps": 20,
        "cfg": 8,
        "sampler_name": "euler",
        "scheduler": "normal",
        "denoise": 1,
        "model": [
          "4",
          0
        ],
        "positive": [
          "6",
          0
        ],
        "negative": [
          "7",
          0
        ],
        "latent_image": [
          "5",
          0
        ]
      },
      "class_type": "KSampler"
    },
    "4": {
      "inputs": {
        "ckpt_name": "v1-5-pruned-emaonly.ckpt"
      },
      "class_type": "CheckpointLoaderSimple"
    },
    "5": {
      "inputs": {
        "width": 1024,
        "height": 576,
        "batch_size": 1
      },
      "class_type": "EmptyLatentImage"
    },
    "6": {
      "inputs": {
        "text": "masterpiece, best quality, scenic visual novel background, anime style",
        "clip": [
          "4",
          1
        ]
      },
      "class_type": "CLIPTextEncode"
    },
    "7": {
      "inputs": {
        "text": "bad eyes, bad anatomy, text, watermark, blurry, low quality",
        "clip": [
          "4",
          1
        ]
      },
      "class_type": "CLIPTextEncode"
    },
    "8": {
      "inputs": {
        "samples": [
          "3",
          0
        ],
        "vae": [
          "4",
          2
        ]
      },
      "class_type": "VAEDecode"
    },
    "9": {
      "inputs": {
        "filename_prefix": "VN_Creator",
        "images": [
          "8",
          0
        ]
      },
      "class_type": "SaveImage"
    }
  };
}

export function prepareComfyWorkflow(
  workflowStr: string,
  positivePrompt: string,
  width = 1024,
  height = 576,
  loraTrigger?: string
): any {
  try {
    const workflow = JSON.parse(workflowStr || JSON.stringify(getDefaultWorkflow()));
    let foundPositive = false;
    const trimmedTrigger = loraTrigger?.trim();

    for (const [nodeId, node] of Object.entries(workflow) as [string, any][]) {
      // Dynamic LoRA Loader Handling
      if (node.class_type === "LoraLoader" || node.class_type?.includes("LoraLoader")) {
        node.inputs = node.inputs || {};
        if (trimmedTrigger && trimmedTrigger.length > 0) {
          const loraFilename = trimmedTrigger.endsWith('.safetensors') || trimmedTrigger.endsWith('.ckpt') || trimmedTrigger.endsWith('.pt')
            ? trimmedTrigger
            : `${trimmedTrigger}.safetensors`;
          node.inputs.lora_name = loraFilename;
          // Ensure strengths are enabled if set or 0
          if (node.inputs.strength_model === undefined || node.inputs.strength_model === 0) {
            node.inputs.strength_model = 1.0;
          }
          if (node.inputs.strength_clip === undefined || node.inputs.strength_clip === 0) {
            node.inputs.strength_clip = 1.0;
          }
        } else {
          // No trigger provided: disable LoRA effect
          node.inputs.strength_model = 0;
          node.inputs.strength_clip = 0;
        }
      }

      // Find CLIPTextEncode nodes
      if (node.class_type === "CLIPTextEncode") {
        const currentText = node.inputs?.text || "";
        // If it looks like negative keywords, skip it as positive candidate
        const isNegativeKeywords = /negative|bad|blurry|ugly|deformed|text|watermark/i.test(currentText);
        if (!isNegativeKeywords && !foundPositive) {
          node.inputs = node.inputs || {};
          node.inputs.text = positivePrompt;
          foundPositive = true;
        }
      }

      // Optionally update width/height in EmptyLatentImage
      if (node.class_type === "EmptyLatentImage") {
        if (node.inputs) {
          node.inputs.width = width;
          node.inputs.height = height;
        }
      }

      // Optionally update random seed in KSampler
      if (node.class_type === "KSampler") {
        if (node.inputs) {
          node.inputs.seed = Math.floor(Math.random() * 1000000000);
        }
      }
    }

    // Fallback: If no positive prompt CLIPTextEncode was found by heuristic, set first found CLIPTextEncode
    if (!foundPositive) {
      for (const [nodeId, node] of Object.entries(workflow) as [string, any][]) {
        if (node.class_type === "CLIPTextEncode") {
          node.inputs = node.inputs || {};
          node.inputs.text = positivePrompt;
          break;
        }
      }
    }

    return workflow;
  } catch (e) {
    console.error("Fehler beim Verarbeiten des ComfyUI-Workflows:", e);
    return null;
  }
}

export async function generateComfyImage(
  comfyUrl: string,
  workflowJson: any,
  onStatusUpdate: (status: string) => void
): Promise<string> {
  const normalizedUrl = comfyUrl.replace(/\/$/, "");

  // 1. Verbindungsprüfung & Queue-Request
  onStatusUpdate("Sende Prompt an ComfyUI...");
  
  let promptId = "";
  try {
    const response = await fetch(`${normalizedUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflowJson })
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`ComfyUI Antwortfehler: ${response.status} - ${txt}`);
    }

    const resData = await response.json();
    promptId = resData.prompt_id;
    if (!promptId) {
      throw new Error("ComfyUI hat keine prompt_id zurückgegeben.");
    }
  } catch (err: any) {
    console.error("ComfyUI Connection/Queue Error:", err);
    throw new Error(
      `Verbindung zu ComfyUI unter ${normalizedUrl} fehlgeschlagen.\n\n` +
      `Mögliche Ursachen:\n` +
      `1. ComfyUI läuft nicht auf deinem PC.\n` +
      `2. Der Server blockiert die Anfrage (CORS). Stelle sicher, dass du ComfyUI mit dem Argument '--enable-cors-header' gestartet hast.\n` +
      `Details: ${err.message}`
    );
  }

  // 2. Polling für Fertigstellung
  onStatusUpdate("In Warteschlange eingereiht...");
  
  let attempts = 0;
  const maxAttempts = 180; // 3 Minuten max
  const pollInterval = 1000; // 1 Sekunde

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    attempts++;

    try {
      // Prüfe History für diese promptId
      const historyRes = await fetch(`${normalizedUrl}/history/${promptId}`);
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        
        // Wenn das Objekt mit promptId gefüllt ist, ist der Run fertig
        if (historyData && historyData[promptId]) {
          const runDetails = historyData[promptId];
          const outputs = runDetails.outputs;
          
          if (!outputs) {
            throw new Error("Generierung abgeschlossen, aber keine Ausgabedaten gefunden.");
          }

          // Finde den SaveImage oder PreviewImage Knoten mit Bildausgabe
          let imageInfo: { filename: string; type: string; subfolder?: string } | null = null;
          
          for (const nodeOutput of Object.values(outputs) as any[]) {
            if (nodeOutput.images && nodeOutput.images.length > 0) {
              imageInfo = nodeOutput.images[0];
              break;
            }
          }

          if (!imageInfo) {
            throw new Error("Kein Ausgabebild im fertigen Workflow gefunden.");
          }

          onStatusUpdate("Bild fertiggestellt! Lade Bilddaten...");
          
          // 3. Bild abrufen und in Base64 umwandeln
          const viewUrl = `${normalizedUrl}/view?filename=${encodeURIComponent(imageInfo.filename)}&type=${encodeURIComponent(imageInfo.type)}` + 
            (imageInfo.subfolder ? `&subfolder=${encodeURIComponent(imageInfo.subfolder)}` : "");
          
          const imgRes = await fetch(viewUrl);
          if (!imgRes.ok) {
            throw new Error("Konnte das generierte Bild nicht vom ComfyUI-Server laden.");
          }

          const blob = await imgRes.blob();
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (reader.result) {
                resolve(reader.result as string);
              } else {
                reject(new Error("Fehler beim Lesen der Bilddaten."));
              }
            };
            reader.onerror = () => reject(new Error("FileReader Fehler."));
            reader.readAsDataURL(blob);
          });
        }
      }
      
      // Wenn noch nicht fertig, zeige Fortschritt
      onStatusUpdate(`Generiere Bild... (${attempts}s)`);
    } catch (e: any) {
      console.warn("Fehler beim Abfragen des Status:", e);
      // Führe Polling fort bei temporären Netzwerkfehlen
    }
  }

  throw new Error("Zeitlimit bei der Bildgenerierung überschritten (3 Minuten).");
}
