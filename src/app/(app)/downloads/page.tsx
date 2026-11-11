"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Download, FileText, File, Image as ImageIcon, Film, Music, FolderOpen, Loader2 } from "lucide-react";

type FileKind = "pdf" | "image" | "video" | "audio" | "other";

function kindOf(url: string): FileKind {
  const u = url.toLowerCase();
  if (/\.pdf($|\?)/.test(u)) return "pdf";
  if (/(\.png|\.jpe?g|\.webp|\.gif)($|\?)/.test(u)) return "image";
  if (/(\.mp4|\.webm|\.mov)($|\?)/.test(u)) return "video";
  if (/(\.mp3|\.m4a|\.wav|\.ogg)($|\?)/.test(u)) return "audio";
  return "other";
}

function icon(kind: FileKind) {
  switch (kind) {
    case "pdf": return <FileText className="h-6 w-6 text-red-500" />;
    case "image": return <ImageIcon className="h-6 w-6 text-blue-500" />;
    case "video": return <Film className="h-6 w-6 text-purple-500" />;
    case "audio": return <Music className="h-6 w-6 text-green-500" />;
    default: return <File className="h-6 w-6 text-muted-foreground" />;
  }
}

interface Item {
  url: string;
  name: string;
  kind: FileKind;
  size?: string;
}

export default function DownloadsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [native, setNative] = useState(false);

  function addItem() {
    const u = url.trim();
    if (!u) {
      showToast("Paste a direct file URL first.", "error");
      return;
    }
    const name = u.split("/").pop()?.split("?")[0] || "download";
    setItems((s) => [{ url: u, name, kind: kindOf(u) }, ...s]);
    setUrl("");
  }

  function nativeAvailable(): boolean {
    return typeof window !== "undefined" && Boolean((window as any).BioPulseBridge?.downloadFile);
  }

  function doDownload(item: Item) {
    if (nativeAvailable()) {
      try {
        (window as any).BioPulseBridge.downloadFile(item.url, item.name);
        showToast("Saving to your phone…", "success");
        return;
      } catch (e) {
        // fall through to web download
      }
    }
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast("Download started.", "success");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <PageHeader
        title="Download Manager"
        description="Download Telegram PDFs and chat images, videos & audio — saved directly to your phone."
      />

      <Card className="p-5 mb-6">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" /> Add a file URL
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="flex gap-2">
            <Input
              placeholder="Paste direct file URL (e.g. https://…/notes.pdf)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
            <Button onClick={addItem} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Works with direct download links from Telegram (long-press a file → Copy link) and any public file URL.
          </p>
          {nativeAvailable() && (
            <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
              <FolderOpen className="h-3 w-3" /> Native saving to your device Downloads folder is active.
            </p>
          )}
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card className="p-10 text-center">
          <Download className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            No downloads yet. Add a file URL above to get started.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <Card key={i} className="p-3">
              <div className="flex items-center gap-3">
                {icon(item.kind)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.kind.toUpperCase()} {item.size ? "· " + item.size : ""}
                  </p>
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => doDownload(item)}>
                  <Download className="h-4 w-4" /> Save
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}