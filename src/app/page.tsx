"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { partial } from "filesize";
import { UploadCloud, File, Trash2, Download, Loader2, Pencil, Check, X, Eye, Share2, Search, LogOut, Folder, FolderPlus, ChevronRight, LayoutGrid, List, FolderOutput } from "lucide-react";
import { useRouter } from "next/navigation";
import Editor from "@monaco-editor/react";

const sizeFormatter = partial({ standard: "jedec" });

interface FileObject {
  key: string;
  size: number;
  lastModified: string;
}

interface FolderObject {
  name: string;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

function getCleanFileName(key: string) {
  const uuidRegex = /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\.[^.]+$|$)/i;
  return key.replace(uuidRegex, '');
}

function FolderSizeIndicator({ prefix, viewMode }: { prefix: string, viewMode: "grid" | "list" }) {
  const [size, setSize] = useState<number | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchSize = async () => {
      try {
        const res = await fetch(`/api/folder/size?prefix=${encodeURIComponent(prefix)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setSize(data.size);
            setCount(data.count);
          }
        }
      } catch (error) {
        console.error("Failed to fetch folder size", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchSize();
    return () => { isMounted = false; };
  }, [prefix]);

  if (loading) {
    return (
      <div className={viewMode === "grid" ? "flex justify-between items-center text-sm text-slate-400 mt-4" : "hidden sm:flex items-center gap-4 lg:gap-6 w-32 md:w-48 text-sm text-slate-400 flex-shrink-0"}>
        <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className={viewMode === "grid" ? "flex justify-between items-center text-sm text-slate-400 mt-4" : "hidden sm:flex items-center gap-4 lg:gap-6 w-32 md:w-48 text-sm text-slate-400 flex-shrink-0"}>
      <span className={viewMode === "list" ? "w-16 text-left truncate" : ""}>{size !== null ? sizeFormatter(size) : "Unknown"}</span>
      <span className={viewMode === "list" ? "w-24 text-left truncate" : ""}>{count !== null ? `${count} file${count === 1 ? '' : 's'}` : "-"}</span>
    </div>
  );
}

export default function Home() {
  const [files, setFiles] = useState<FileObject[]>([]);
  const [folders, setFolders] = useState<FolderObject[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"image" | "video" | "pdf" | "code" | "unsupported" | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sharingKey, setSharingKey] = useState<string | null>(null);
  const [shareExpiration, setShareExpiration] = useState<number>(7 * 24 * 3600);
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [movingKeys, setMovingKeys] = useState<string[]>([]);
  const [allFolders, setAllFolders] = useState<string[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<string>("");
  const [isMoving, setIsMoving] = useState(false);
  const [draggedFileKey, setDraggedFileKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "largest" | "smallest">("newest");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [searchResults, setSearchResults] = useState<{ files: FileObject[], folders: FolderObject[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const displayFiles = searchResults ? searchResults.files : files;
  const displayFolders = searchResults ? searchResults.folders : folders;

  const sortedAndFilteredFiles = displayFiles
    .sort((a, b) => {
      if (sortBy === "newest") return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      if (sortBy === "oldest") return new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
      if (sortBy === "largest") return b.size - a.size;
      if (sortBy === "smallest") return a.size - b.size;
      return 0;
    });

  const filteredFolders = displayFolders;

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files?prefix=${encodeURIComponent(currentPath)}`);
      const data = await res.json();
      setFiles(data.files || []);
      setFolders(data.folders || []);
    } catch (error) {
      console.error("Failed to fetch files", error);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    fetchFiles();
    setSelectedItems(new Set());
  }, [currentPath, fetchFiles]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        if (res.ok) {
          setSearchResults(data);
        }
      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input (except Escape/Ctrl+F)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          setEditingKey(null);
          setPreviewUrl(null);
          setPreviewType(null);
          setPreviewKey(null);
          setSharingKey(null);
          setGeneratedShareUrl(null);
          setMovingKeys([]);
          setSelectedItems(new Set());
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === 'Escape') {
        setEditingKey(null);
        setPreviewUrl(null);
        setPreviewType(null);
        setPreviewKey(null);
        setSharingKey(null);
        setGeneratedShareUrl(null);
        setMovingKeys([]);
        setSelectedItems(new Set());
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItems.size > 0) {
          e.preventDefault();
          if (!confirm(`Are you sure you want to delete ${selectedItems.size} items?`)) return;
          const keys = Array.from(selectedItems).filter(k => !k.endsWith("/"));
          const prefixes = Array.from(selectedItems).filter(k => k.endsWith("/"));
          fetch("/api/bulk/delete", {
            method: "POST",
            body: JSON.stringify({ keys, prefixes }),
            headers: { "Content-Type": "application/json" },
          }).then(() => {
            setSelectedItems(new Set());
            fetchFiles();
          }).catch(err => {
            console.error("Bulk delete failed", err);
            alert("Failed to delete some items");
          });
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const allKeys = [
          ...filteredFolders.map(f => f.name),
          ...sortedAndFilteredFiles.map(f => f.key)
        ];
        if (selectedItems.size === allKeys.length && allKeys.length > 0) {
          setSelectedItems(new Set());
        } else {
          setSelectedItems(new Set(allKeys));
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItems, filteredFolders, sortedAndFilteredFiles, fetchFiles]);

  const createFolder = async () => {
    const folderName = prompt("Enter folder name:");
    if (!folderName) return;

    const newPath = currentPath ? `${currentPath}${folderName}/` : `${folderName}/`;
    
    // Optimistic Update
    setFolders((prev) => [...prev, { name: newPath }]);

    try {
      await fetch("/api/folder/create", {
        method: "POST",
        body: JSON.stringify({ path: newPath }),
        headers: { "Content-Type": "application/json" },
      });
      fetchFiles();
    } catch (error) {
      console.error("Failed to create folder", error);
      fetchFiles();
    }
  };

  const deleteFolder = async (prefix: string) => {
    if (!confirm("Are you sure you want to delete this folder and ALL its contents?")) return;

    setFolders((prev) => prev.filter(f => f.name !== prefix));

    try {
      await fetch("/api/folder/delete", {
        method: "POST",
        body: JSON.stringify({ prefix }),
        headers: { "Content-Type": "application/json" },
      });
      fetchFiles();
    } catch (error) {
      console.error("Failed to delete folder", error);
      fetchFiles();
    }
  };

  const downloadFolder = (folderName: string) => {
    const params = new URLSearchParams();
    params.set("keys", encodeURIComponent(JSON.stringify([])));
    params.set("prefixes", encodeURIComponent(JSON.stringify([folderName])));
    window.open(`/api/bulk/download?${params.toString()}`, "_blank");
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.items) {
      const items = Array.from(e.dataTransfer.items);
      items.forEach(item => {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) traverseFileTree(entry);
        }
      });
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      filesArray.forEach(file => uploadFile(file));
    }
  }, []);

  const traverseFileTree = (item: any, path = "") => {
    if (item.isFile) {
      item.file((file: File) => {
        uploadFile(file, path);
      });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      const readEntries = () => {
        dirReader.readEntries((entries: any[]) => {
          if (entries.length > 0) {
            entries.forEach(entry => {
              traverseFileTree(entry, path + item.name + "/");
            });
            readEntries();
          }
        });
      };
      readEntries();
    }
  };

  const uploadFile = async (file: File, relativePath: string = "") => {
    const filename = file.name;
    const contentType = file.type || "application/octet-stream";
    const targetPath = currentPath + relativePath;
    const progressKey = relativePath ? `${relativePath}${filename}` : filename;

    setUploadProgress((prev) => ({ ...prev, [progressKey]: 0 }));

    try {
      // 1. Create Multipart Upload
      const createRes = await fetch("/api/upload/multipart/create", {
        method: "POST",
        body: JSON.stringify({ filename, contentType, path: targetPath }),
        headers: { "Content-Type": "application/json" },
      });
      const { uploadId, key, error: createError } = await createRes.json();

      if (!uploadId || createError) throw new Error(createError || "Failed to initialize upload");

      // 2. Fetch Presigned URLs for all chunks
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const partNumbers = Array.from({ length: totalChunks }, (_, i) => i + 1);

      const urlsRes = await fetch("/api/upload/multipart/urls", {
        method: "POST",
        body: JSON.stringify({ key, uploadId, parts: partNumbers }),
        headers: { "Content-Type": "application/json" },
      });
      const { urls, error: urlsError } = await urlsRes.json();
      if (urlsError) throw new Error(urlsError || "Failed to generate upload URLs");

      const uploadedParts: { partNumber: number; eTag: string }[] = [];
      let uploadedBytes = 0;
      const BATCH_SIZE = 4; // Upload 4 chunks concurrently

      for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
        const batch = [];
        
        for (let j = 0; j < BATCH_SIZE && i + j < totalChunks; j++) {
          const chunkIndex = i + j;
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          const partNumber = chunkIndex + 1;
          const presignedUrl = urls.find((u: any) => u.partNumber === partNumber)?.url;

          if (!presignedUrl) throw new Error(`Missing presigned URL for part ${partNumber}`);

          batch.push(
            (async () => {
              const uploadRes = await fetch(presignedUrl, {
                method: "PUT",
                body: chunk,
              });

              if (!uploadRes.ok) throw new Error(`Failed to upload part ${partNumber}`);

              const eTag = uploadRes.headers.get("ETag") || uploadRes.headers.get("etag");
              if (!eTag) throw new Error(`No ETag returned for part ${partNumber}. You MUST configure your Minio/S3 CORS policy to ExposeHeaders: ["ETag"]`);

              uploadedBytes += chunk.size;
              setUploadProgress((prev) => ({ ...prev, [progressKey]: Math.round((uploadedBytes / file.size) * 100) }));

              return { partNumber, eTag: eTag.replace(/"/g, "") }; // S3 sometimes wraps ETags in quotes
            })()
          );
        }

        const batchResults = await Promise.all(batch);
        uploadedParts.push(...batchResults);
      }

      // Ensure parts are sorted strictly by partNumber before complete command
      uploadedParts.sort((a, b) => a.partNumber - b.partNumber);

      // 4. Complete upload
      const completeRes = await fetch("/api/upload/multipart/complete", {
        method: "POST",
        body: JSON.stringify({ key, uploadId, parts: uploadedParts }),
        headers: { "Content-Type": "application/json" },
      });

      const { error: completeError } = await completeRes.json();
      if (completeError) throw new Error(completeError);

      setUploadProgress((prev) => {
        const newProgress = { ...prev };
        delete newProgress[progressKey];
        return newProgress;
      });

      fetchFiles();
    } catch (error: any) {
      console.error("Upload failed", error);
      setUploadProgress((prev) => {
        const newProgress = { ...prev };
        delete newProgress[progressKey];
        return newProgress;
      });
      alert(`Upload failed: ${error.message}`);
    }
  };

  const toggleSelection = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    const allKeys = [
      ...filteredFolders.map(f => f.name),
      ...sortedAndFilteredFiles.map(f => f.key)
    ];
    if (selectedItems.size === allKeys.length && allKeys.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(allKeys));
    }
  };

  const bulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedItems.size} items?`)) return;

    const keys = Array.from(selectedItems).filter(k => !k.endsWith("/"));
    const prefixes = Array.from(selectedItems).filter(k => k.endsWith("/"));

    try {
      await fetch("/api/bulk/delete", {
        method: "POST",
        body: JSON.stringify({ keys, prefixes }),
        headers: { "Content-Type": "application/json" },
      });
      setSelectedItems(new Set());
      fetchFiles();
    } catch (error) {
      console.error("Bulk delete failed", error);
      alert("Failed to delete some items");
    }
  };

  const bulkDownload = () => {
    const keys = Array.from(selectedItems).filter(k => !k.endsWith("/"));
    const prefixes = Array.from(selectedItems).filter(k => k.endsWith("/"));

    const params = new URLSearchParams();
    params.set("keys", encodeURIComponent(JSON.stringify(keys)));
    params.set("prefixes", encodeURIComponent(JSON.stringify(prefixes)));

    window.open(`/api/bulk/download?${params.toString()}`, "_blank");
    setSelectedItems(new Set());
  };

  const renameFile = async (oldKey: string, newName: string) => {
    if (!newName.trim() || newName === getCleanFileName(oldKey)) {
      setEditingKey(null);
      return;
    }
    
    // Optimistic Update
    setFiles((prev) => prev.map(f => f.key === oldKey ? { ...f, key: newName } : f));
    setEditingKey(null);

    try {
      const res = await fetch("/api/rename", {
        method: "POST",
        body: JSON.stringify({ oldKey, newName }),
        headers: { "Content-Type": "application/json" },
      });
      
      const data = await res.json();
      if (data.newKey) {
        setFiles((prev) => prev.map(f => f.key === newName ? { ...f, key: data.newKey } : f));
      } else {
        fetchFiles();
      }
    } catch (error) {
      console.error("Failed to rename file", error);
      fetchFiles(); // Revert on error
    }
  };

  const fetchAllFolders = async () => {
    try {
      const res = await fetch("/api/folders/all");
      const data = await res.json();
      setAllFolders(data.folders || []);
    } catch (error) {
      console.error("Failed to fetch all folders", error);
    }
  };

  const openMoveModal = (keys: string[]) => {
    setMovingKeys(keys);
    setSelectedDestination("");
    fetchAllFolders();
  };

  const moveFiles = async (keys: string[], destinationPrefix: string) => {
    setIsMoving(true);
    
    const fileKeys = keys.filter(k => !k.endsWith("/"));
    const prefixKeys = keys.filter(k => k.endsWith("/"));

    // Optimistic Update
    setFiles((prev) => prev.filter(f => !fileKeys.includes(f.key)));
    setFolders((prev) => prev.filter(f => !prefixKeys.includes(f.name)));

    try {
      const res = await fetch("/api/bulk/move", {
        method: "POST",
        body: JSON.stringify({ keys: fileKeys, prefixes: prefixKeys, destinationPrefix }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to move");
      
      setToastMessage(`Moved ${keys.length} items successfully!`);
      setTimeout(() => setToastMessage(null), 3000);
      setMovingKeys([]);
      setSelectedItems(new Set());
      fetchFiles();
    } catch (error) {
      console.error(error);
      setToastMessage("Failed to move items");
      setTimeout(() => setToastMessage(null), 3000);
      fetchFiles(); // Revert
    } finally {
      setIsMoving(false);
    }
  };

  const deleteFile = async (key: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return;

    // Optimistic Update
    setFiles((prev) => prev.filter(f => f.key !== key));

    try {
      await fetch(`/api/delete?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    } catch (error) {
      console.error("Failed to delete file", error);
      fetchFiles(); // Revert on error
    }
  };

  const downloadFile = async (key: string) => {
    try {
      const res = await fetch(`/api/download?key=${encodeURIComponent(key)}`);
      const { url } = await res.json();
      if (url) window.open(url, "_blank");
    } catch (error) {
      console.error("Failed to download file", error);
    }
  };

  const saveFileContent = async () => {
    if (!previewKey) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/file/raw", {
        method: "POST",
        body: JSON.stringify({ key: previewKey, content: previewContent }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to save");
      setToastMessage("File saved successfully!");
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error(error);
      alert("Failed to save file");
    } finally {
      setIsSaving(false);
    }
  };

  const previewFile = async (key: string) => {
    try {
      const ext = key.split('.').pop()?.toLowerCase();
      let type: "image" | "video" | "pdf" | "code" | "unsupported" = "unsupported";
      
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) type = "image";
      else if (['mp4', 'webm', 'ogg', 'mkv'].includes(ext || '')) type = "video";
      else if (ext === 'pdf') type = "pdf";
      else if (['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'csv', 'yaml', 'yml'].includes(ext || '')) type = "code";

      setPreviewType(type);
      setPreviewKey(key);

      if (type === "code") {
        setPreviewUrl("dummy");
        const res = await fetch(`/api/file/raw?key=${encodeURIComponent(key)}`);
        const text = await res.text();
        setPreviewContent(text);
      } else {
        const res = await fetch(`/api/download?key=${encodeURIComponent(key)}`);
        const { url } = await res.json();
        if (url) setPreviewUrl(url);
      }
    } catch (error) {
      console.error("Failed to preview file", error);
    }
  };

  const shareFile = (key: string) => {
    setSharingKey(key);
    setGeneratedShareUrl(null);
    setShareExpiration(7 * 24 * 3600);
  };

  const generateShareLink = async () => {
    if (!sharingKey) return;
    setIsGeneratingShare(true);
    try {
      const res = await fetch(`/api/share?key=${encodeURIComponent(sharingKey)}&expiresIn=${shareExpiration}`);
      const { url } = await res.json();
      if (url) {
        setGeneratedShareUrl(url);
      }
    } catch (error) {
      console.error("Failed to generate share link", error);
      setToastMessage("Failed to generate link");
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const copyShareLink = async () => {
    if (!generatedShareUrl) return;
    try {
      await navigator.clipboard.writeText(generatedShareUrl);
      setToastMessage("Link copied to clipboard!");
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error("Failed to copy", error);
    }
  };

  return (
    <main className="min-h-screen p-8 md:p-24 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        <header className="mb-12 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
              VaultS3
            </h1>
            <p className="text-slate-400 text-lg">Your minimalistic file manager</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 rounded-full transition-colors text-slate-300 hover:text-white shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Log out</span>
          </button>
        </header>

        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto whitespace-nowrap pb-2 glass rounded-2xl p-4">
          <button 
            onClick={() => setCurrentPath("")}
            className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <UploadCloud className="w-4 h-4" />
            Home
          </button>
          {currentPath.split("/").filter(Boolean).map((part, index, arr) => {
            const pathToHere = arr.slice(0, index + 1).join("/") + "/";
            return (
              <div key={pathToHere} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-slate-600" />
                <button
                  onClick={() => setCurrentPath(pathToHere)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  {part}
                </button>
              </div>
            );
          })}
        </div>

        {/* Upload Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`glass rounded-3xl p-12 mb-12 text-center transition-all duration-300 border-2 border-dashed ${isDragActive ? "border-blue-400 bg-blue-500/10 scale-[1.02]" : "border-slate-700/50 hover:border-slate-500/50"
            }`}
        >
          <input
            type="file"
            id="file-upload"
            className="hidden"
            multiple
            onChange={(e) => {
              if (e.target.files) {
                const filesArray = Array.from(e.target.files);
                filesArray.forEach(file => uploadFile(file));
              }
              e.target.value = "";
            }}
          />
          <input
            type="file"
            id="folder-upload"
            className="hidden"
            /* @ts-expect-error non-standard attributes */
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={(e) => {
              if (e.target.files) {
                const filesArray = Array.from(e.target.files);
                filesArray.forEach(file => {
                  const relativePath = file.webkitRelativePath ? file.webkitRelativePath.substring(0, file.webkitRelativePath.lastIndexOf('/') + 1) : "";
                  uploadFile(file, relativePath);
                });
              }
              e.target.value = "";
            }}
          />
          <div className="flex flex-col items-center justify-center">
            <UploadCloud className={`w-16 h-16 mb-6 transition-colors ${isDragActive ? "text-blue-400" : "text-slate-400"}`} />
            <h3 className="text-2xl font-semibold mb-2">Drag & Drop files or folders here</h3>
            <p className="text-slate-400 mb-6">or click below to browse your computer</p>
            <div className="flex gap-4">
              <label htmlFor="file-upload" className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full font-medium transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]">
                Select Files
              </label>
              <label htmlFor="folder-upload" className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-full font-medium transition-all shadow-[0_0_20px_rgba(51,65,85,0.3)] hover:shadow-[0_0_30px_rgba(51,65,85,0.5)] border border-slate-600">
                Select Folder
              </label>
            </div>
          </div>
        </div>

        {/* Upload Progress */}
        {Object.keys(uploadProgress).length > 0 && (
          <div className="mb-12 space-y-4">
            <h3 className="text-xl font-semibold">Uploading...</h3>
            {Object.entries(uploadProgress).map(([filename, progress]) => (
              <div key={filename} className="glass rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  <span className="font-medium truncate max-w-[200px] md:max-w-sm">{filename}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden hidden md:block relative">
                    {progress === -1 ? (
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse" />
                    ) : (
                      <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                    )}
                  </div>
                  <span className="text-sm font-mono">{progress === -1 ? "Fetching..." : `${progress}%`}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* File List Header & Search */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <File className="w-6 h-6" />
              Your Files
            </h2>
            <button
              onClick={createFolder}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors border border-slate-700"
              title="New Folder"
            >
              <FolderPlus className="w-5 h-5" />
            </button>
            {(sortedAndFilteredFiles.length > 0 || filteredFolders.length > 0) && (
              <label className="flex items-center gap-2 cursor-pointer ml-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-blue-500"
                  checked={selectedItems.size > 0 && selectedItems.size === sortedAndFilteredFiles.length + filteredFolders.length}
                  onChange={toggleAll}
                />
                Select All
              </label>
            )}
          </div>
          <div className="flex flex-col sm:flex-row w-full md:w-auto gap-4">
            <div className="flex bg-slate-800/50 rounded-full border border-slate-600/50 p-1">
              <button 
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-full transition-colors ${viewMode === "grid" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-300"}`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-full transition-colors ${viewMode === "list" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-300"}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search files (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-600/50 rounded-full pl-10 pr-4 py-2 text-sm outline-none focus:border-blue-400 transition-colors placeholder:text-slate-500 text-slate-200 shadow-inner"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-800/50 border border-slate-600/50 rounded-full px-4 py-2 text-sm outline-none focus:border-blue-400 transition-colors text-slate-200 shadow-inner cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="largest">Largest</option>
              <option value="smallest">Smallest</option>
            </select>
          </div>
        </div>
        
        <div>
          {loading || isSearching ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          ) : files.length === 0 && folders.length === 0 ? (
            <div className="glass rounded-3xl p-12 text-center text-slate-400">
              No files or folders found. Create a folder or upload something to get started!
            </div>
          ) : sortedAndFilteredFiles.length === 0 && filteredFolders.length === 0 ? (
            <div className="glass rounded-3xl p-12 text-center text-slate-400">
              No results match your search &quot;{searchQuery}&quot;.
            </div>
          ) : (
            <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-3"}>
              {/* Folders */}
              {filteredFolders.map((folder) => (
                <div 
                  key={folder.name} 
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("application/x-vaults3-file")) {
                      e.preventDefault();
                      e.currentTarget.classList.add('ring-4', 'ring-blue-500', 'bg-blue-500/20');
                    }
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('ring-4', 'ring-blue-500', 'bg-blue-500/20');
                  }}
                  onDrop={(e) => {
                    e.currentTarget.classList.remove('ring-4', 'ring-blue-500', 'bg-blue-500/20');
                    const key = e.dataTransfer.getData("application/x-vaults3-file");
                    if (key) {
                      e.preventDefault();
                      e.stopPropagation();
                      if (selectedItems.has(key)) {
                        moveFiles(Array.from(selectedItems), folder.name);
                      } else {
                        moveFiles([key], folder.name);
                      }
                    }
                  }}
                  className={`glass group transition-all cursor-pointer relative overflow-hidden ${viewMode === "grid" ? "rounded-2xl p-6 flex flex-col justify-between h-48 hover:scale-[1.02]" : "rounded-xl p-3 sm:p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 hover:bg-slate-800/50"} ${selectedItems.has(folder.name) ? 'ring-2 ring-blue-500 bg-blue-500/10' : ''}`} 
                  onClick={() => setCurrentPath(folder.name)}
                >
                  <div className={viewMode === "grid" ? "" : "flex items-center gap-4 flex-1 min-w-0"}>
                    {viewMode === "grid" && (
                      <div className="absolute top-4 left-4 z-30" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className={`w-5 h-5 rounded border-slate-600 bg-slate-800 accent-blue-500 cursor-pointer transition-opacity ${selectedItems.has(folder.name) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} checked={selectedItems.has(folder.name)} onChange={(e) => toggleSelection(folder.name, e as any)} />
                      </div>
                    )}
                    {viewMode === "list" && (
                      <div className="z-30 flex items-center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="w-5 h-5 rounded border-slate-600 bg-slate-800 accent-blue-500 cursor-pointer" checked={selectedItems.has(folder.name)} onChange={(e) => toggleSelection(folder.name, e as any)} />
                      </div>
                    )}
                    <Folder className={`text-blue-400 fill-blue-400/20 ${viewMode === "grid" ? "w-10 h-10 mb-4" : "w-6 h-6 flex-shrink-0"}`} />
                    <h4 className={`font-semibold truncate ${viewMode === "grid" ? "text-lg pr-16" : "text-sm"}`} title={searchResults ? folder.name : folder.name.split("/").filter(Boolean).pop()}>
                      {searchResults ? folder.name : folder.name.split("/").filter(Boolean).pop()}
                    </h4>
                  </div>
                  
                  <FolderSizeIndicator prefix={folder.name} viewMode={viewMode} />

                  <div className={viewMode === "grid" ? "absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-20" : "opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-20 w-full sm:w-auto justify-end mt-2 sm:mt-0"}>
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadFolder(folder.name); }}
                      className={viewMode === "grid" ? "p-2 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 rounded-full backdrop-blur-md transition-colors" : "p-1.5 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 rounded-md transition-colors"}
                      title="Download Folder as ZIP"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFolder(folder.name); }}
                      className={viewMode === "grid" ? "p-2 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full backdrop-blur-md transition-colors" : "p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-md transition-colors"}
                      title="Delete Folder"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Files */}
              {sortedAndFilteredFiles.map((file) => (
                <div 
                  key={file.key} 
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-vaults3-file", file.key);
                    setDraggedFileKey(file.key);
                  }}
                  onDragEnd={() => setDraggedFileKey(null)}
                  className={`glass group transition-all relative overflow-hidden ${viewMode === "grid" ? "rounded-2xl p-6 flex flex-col justify-between h-48 hover:scale-[1.02]" : "rounded-xl p-3 sm:p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 hover:bg-slate-800/50"} ${selectedItems.has(file.key) ? 'ring-2 ring-blue-500 bg-blue-500/10' : ''} ${draggedFileKey === file.key ? 'opacity-50' : ''}`}
                >
                  <div className={viewMode === "grid" ? "" : "flex items-center gap-4 flex-1 min-w-0"}>
                    {viewMode === "grid" && (
                      <div className="absolute top-4 left-4 z-30" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className={`w-5 h-5 rounded border-slate-600 bg-slate-800 accent-blue-500 cursor-pointer transition-opacity ${selectedItems.has(file.key) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} checked={selectedItems.has(file.key)} onChange={(e) => toggleSelection(file.key, e as any)} />
                      </div>
                    )}
                    {viewMode === "list" && (
                      <div className="z-30 flex items-center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="w-5 h-5 rounded border-slate-600 bg-slate-800 accent-blue-500 cursor-pointer" checked={selectedItems.has(file.key)} onChange={(e) => toggleSelection(file.key, e as any)} />
                      </div>
                    )}
                    <File className={`text-purple-400 ${viewMode === "grid" ? "w-10 h-10 mb-4" : "w-6 h-6 flex-shrink-0"}`} />
                    {editingKey === file.key ? (
                      <div className={`flex items-center gap-2 relative z-30 ${viewMode === "grid" ? "pr-16" : "flex-1"}`}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") renameFile(file.key, editName);
                            if (e.key === "Escape") setEditingKey(null);
                          }}
                          className="w-full bg-slate-800/50 border border-slate-600 rounded px-2 py-1 text-sm outline-none focus:border-blue-400"
                          autoFocus
                        />
                        <button onClick={() => renameFile(file.key, editName)} className="text-green-400 hover:text-green-300"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditingKey(null)} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <h4 className={`font-semibold truncate ${viewMode === "grid" ? "text-lg pr-16" : "text-sm"}`} title={searchResults ? file.key : getCleanFileName(file.key).split("/").pop()}>
                        {searchResults ? file.key : getCleanFileName(file.key).split("/").pop()}
                      </h4>
                    )}
                  </div>

                  <div className={viewMode === "grid" ? "flex justify-between items-center text-sm text-slate-400 mt-4" : "hidden md:flex items-center gap-4 lg:gap-6 w-32 md:w-48 text-sm text-slate-400 flex-shrink-0"}>
                    <span className={viewMode === "list" ? "w-16 text-left truncate" : ""}>{sizeFormatter(file.size)}</span>
                    <span className={viewMode === "list" ? "w-24 text-left truncate" : ""}>{format(new Date(file.lastModified), "MMM dd")}</span>
                  </div>

                  <div className={viewMode === "grid" ? "absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-20" : "opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-20 w-full sm:w-auto justify-end mt-2 sm:mt-0"}>
                    <button onClick={() => previewFile(file.key)} className={viewMode === "grid" ? "p-2 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 rounded-full" : "p-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 rounded-md"} title="Preview">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => shareFile(file.key)} className={viewMode === "grid" ? "p-2 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 rounded-full" : "p-1.5 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 rounded-md"} title="Share Link">
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setEditingKey(file.key); setEditName(getCleanFileName(file.key).split("/").pop() || ""); }} className={viewMode === "grid" ? "p-2 bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 rounded-full" : "p-1.5 bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 rounded-md"} title="Rename">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => openMoveModal([file.key])} className={viewMode === "grid" ? "p-2 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 rounded-full" : "p-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 rounded-md"} title="Move To">
                      <FolderOutput className="w-4 h-4" />
                    </button>
                    <button onClick={() => downloadFile(file.key)} className={viewMode === "grid" ? "p-2 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 rounded-full" : "p-1.5 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 rounded-md"} title="Download">
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteFile(file.key)} className={viewMode === "grid" ? "p-2 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full" : "p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-md"} title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Bar for Bulk Selection */}
      {selectedItems.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 glass px-6 py-4 rounded-full border-blue-500/50 shadow-[0_0_30px_rgba(37,99,235,0.2)] flex items-center gap-6 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <span className="font-semibold text-white">
            {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            <button onClick={bulkDownload} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-medium transition-colors shadow-sm">
              <Download className="w-4 h-4" />
              Download
            </button>
            <button onClick={() => openMoveModal(Array.from(selectedItems))} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-medium transition-colors shadow-sm">
              <FolderOutput className="w-4 h-4" />
              Move
            </button>
            <button onClick={bulkDelete} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-full font-medium transition-colors shadow-sm">
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
            <button onClick={() => setSelectedItems(new Set())} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full transition-colors" title="Clear selection">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {movingKeys.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setMovingKeys([])}>
          <div className="relative glass p-8 rounded-3xl max-w-md w-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setMovingKeys([])} className="absolute top-4 right-4 p-2 bg-slate-800/50 hover:bg-slate-700 rounded-full text-white z-10 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <FolderOutput className="w-12 h-12 text-indigo-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-center">Move {movingKeys.length > 1 ? `${movingKeys.length} items` : 'File'}</h3>
            <p className="text-slate-400 text-sm mb-6 text-center max-w-xs truncate" title={movingKeys[0]}>
              {movingKeys.length > 1 ? "Multiple items selected" : movingKeys[0].split('/').filter(Boolean).pop()}
            </p>
            
            <div className="w-full flex flex-col gap-4">
              <div>
                <label className="block text-sm text-slate-300 mb-2">Destination Folder</label>
                <select 
                  value={selectedDestination} 
                  onChange={e => setSelectedDestination(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-600 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-blue-500 transition-colors cursor-pointer"
                >
                  <option value="">(Root Directory)</option>
                  {allFolders.map(folder => (
                    <option key={folder} value={folder}>{folder}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={() => moveFiles(movingKeys, selectedDestination)} 
                disabled={isMoving}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl py-3 font-medium transition-colors mt-2 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(79,70,229,0.3)]"
              >
                {isMoving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Move Here
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {sharingKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSharingKey(null)}>
          <div className="relative glass p-8 rounded-3xl max-w-md w-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSharingKey(null)} className="absolute top-4 right-4 p-2 bg-slate-800/50 hover:bg-slate-700 rounded-full text-white z-10 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <Share2 className="w-12 h-12 text-blue-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-center">Share File</h3>
            <p className="text-slate-400 text-sm mb-6 text-center max-w-xs truncate" title={sharingKey}>{sharingKey.split('/').pop()}</p>
            
            {!generatedShareUrl ? (
              <div className="w-full flex flex-col gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-2">Link Expiration</label>
                  <select 
                    value={shareExpiration} 
                    onChange={e => setShareExpiration(Number(e.target.value))}
                    className="w-full bg-slate-800/80 border border-slate-600 rounded-xl px-4 py-3 text-slate-200 outline-none focus:border-blue-500 transition-colors cursor-pointer"
                  >
                    <option value={3600}>1 Hour</option>
                    <option value={43200}>12 Hours</option>
                    <option value={86400}>1 Day</option>
                    <option value={259200}>3 Days</option>
                    <option value={604800}>7 Days</option>
                  </select>
                </div>
                <button 
                  onClick={generateShareLink} 
                  disabled={isGeneratingShare}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-3 font-medium transition-colors mt-2 flex items-center justify-center gap-2"
                >
                  {isGeneratingShare ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                  Generate Link
                </button>
              </div>
            ) : (
              <div className="w-full flex flex-col gap-4">
                <div className="bg-slate-800/80 border border-slate-600 rounded-xl p-3 flex items-center gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={generatedShareUrl} 
                    className="bg-transparent border-none outline-none text-slate-300 text-sm w-full flex-1"
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                </div>
                <button 
                  onClick={copyShareLink} 
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-3 font-medium transition-colors flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                >
                  <Check className="w-5 h-5" />
                  Copy Link
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setPreviewUrl(null)}>
          <div className="relative glass p-4 rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col items-center justify-center overflow-hidden" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute top-4 right-4 p-2 bg-slate-800/50 hover:bg-slate-700 rounded-full text-white z-10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {previewType === 'image' && <img src={previewUrl} alt="Preview" className="max-w-full max-h-[80vh] object-contain rounded-xl" />}
            {previewType === 'video' && <video src={previewUrl} controls className="max-w-full max-h-[80vh] rounded-xl outline-none" autoPlay />}
            {previewType === 'pdf' && <iframe src={previewUrl} className="w-full h-[80vh] rounded-xl bg-white border-0" />}
            {previewType === 'code' && (
              <div className="w-full h-[80vh] bg-[#1e1e1e] rounded-xl overflow-hidden flex flex-col">
                <div className="flex justify-between items-center bg-slate-800 p-3 border-b border-slate-700">
                  <span className="text-slate-300 font-mono text-sm">{previewKey?.split('/').pop()}</span>
                  <button 
                    onClick={saveFileContent}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-md font-medium transition-colors text-sm flex items-center gap-2"
                  >
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                </div>
                <div className="flex-1">
                  <Editor
                    height="100%"
                    theme="vs-dark"
                    path={previewKey || undefined}
                    value={previewContent}
                    onChange={(value) => setPreviewContent(value || "")}
                    options={{ minimap: { enabled: false }, fontSize: 14, wordWrap: "on" }}
                  />
                </div>
              </div>
            )}
            {previewType === 'unsupported' && (
              <div className="text-center p-12">
                <File className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Preview Available</h3>
                <p className="text-slate-400 mb-6">This file type cannot be previewed directly in the browser.</p>
                <a href={previewUrl} target="_blank" rel="noreferrer" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full font-medium transition-all inline-flex items-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                  <Download className="w-4 h-4" />
                  Download File
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast Message */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 glass px-6 py-3 rounded-full border-blue-500/50 shadow-[0_0_20px_rgba(37,99,235,0.2)] text-white text-sm font-medium">
          {toastMessage}
        </div>
      )}
    </main>
  );
}
