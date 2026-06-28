"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { partial } from "filesize";
import { UploadCloud, File, Trash2, Download, Loader2, Pencil, Check, X, Eye, Share2, Search, LogOut, Folder, FolderPlus, ChevronRight, LayoutGrid, List } from "lucide-react";
import { useRouter } from "next/navigation";

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
  const [previewType, setPreviewType] = useState<"image" | "video" | "pdf" | "unsupported" | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "largest" | "smallest">("newest");
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const fetchFiles = async () => {
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
  };

  useEffect(() => {
    fetchFiles();
  }, [currentPath]);

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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      filesArray.forEach(file => uploadFile(file));
    }
  }, []);

  const uploadFile = async (file: File) => {
    const filename = file.name;
    const contentType = file.type || "application/octet-stream";

    setUploadProgress((prev) => ({ ...prev, [filename]: 0 }));

    try {
      // 1. Create Multipart Upload
      const createRes = await fetch("/api/upload/multipart/create", {
        method: "POST",
        body: JSON.stringify({ filename, contentType, path: currentPath }),
        headers: { "Content-Type": "application/json" },
      });
      const { uploadId, key, error: createError } = await createRes.json();

      if (!uploadId || createError) throw new Error(createError || "Failed to initialize upload");

      // 2. Upload chunks via Next.js backend proxy in parallel batches
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
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

          batch.push(
            (async () => {
              const formData = new FormData();
              formData.append("key", key);
              formData.append("uploadId", uploadId);
              formData.append("partNumber", partNumber.toString());
              formData.append("chunk", chunk);

              const uploadRes = await fetch("/api/upload/multipart/chunk", {
                method: "POST",
                body: formData,
              });

              if (!uploadRes.ok) throw new Error(`Failed to upload part ${partNumber}`);

              const data = await uploadRes.json();
              
              uploadedBytes += chunk.size;
              setUploadProgress((prev) => ({ ...prev, [filename]: Math.round((uploadedBytes / file.size) * 100) }));

              return { partNumber, eTag: data.eTag };
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
        delete newProgress[filename];
        return newProgress;
      });

      fetchFiles();
    } catch (error: any) {
      console.error("Upload failed", error);
      setUploadProgress((prev) => {
        const newProgress = { ...prev };
        delete newProgress[filename];
        return newProgress;
      });
      alert(`Upload failed: ${error.message}\n(Make sure your bucket allows CORS headers with ExposeHeaders: ETag).`);
    }
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

  const previewFile = async (key: string) => {
    try {
      const res = await fetch(`/api/download?key=${encodeURIComponent(key)}`);
      const { url } = await res.json();
      if (url) {
        const ext = key.split('.').pop()?.toLowerCase();
        let type: "image" | "video" | "pdf" | "unsupported" = "unsupported";
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) type = "image";
        else if (['mp4', 'webm', 'ogg', 'mkv'].includes(ext || '')) type = "video";
        else if (ext === 'pdf') type = "pdf";

        setPreviewType(type);
        setPreviewUrl(url);
      }
    } catch (error) {
      console.error("Failed to generate preview url", error);
    }
  };

  const shareFile = async (key: string) => {
    try {
      const res = await fetch(`/api/share?key=${encodeURIComponent(key)}`);
      const { url } = await res.json();
      if (url) {
        await navigator.clipboard.writeText(url);
        setToastMessage("Link copied to clipboard!");
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (error) {
      console.error("Failed to generate share link", error);
      setToastMessage("Failed to copy link");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const sortedAndFilteredFiles = files
    .filter(file => {
      const name = getCleanFileName(file.key).split("/").pop() || "";
      return name.toLowerCase().includes(searchQuery.toLowerCase());
    })
    .sort((a, b) => {
      if (sortBy === "newest") return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      if (sortBy === "oldest") return new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
      if (sortBy === "largest") return b.size - a.size;
      if (sortBy === "smallest") return a.size - b.size;
      return 0;
    });

  const filteredFolders = folders.filter(folder => {
    const name = folder.name.split("/").filter(Boolean).pop() || "";
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

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
            }}
          />
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center">
            <UploadCloud className={`w-16 h-16 mb-6 transition-colors ${isDragActive ? "text-blue-400" : "text-slate-400"}`} />
            <h3 className="text-2xl font-semibold mb-2">Drag & Drop files here</h3>
            <p className="text-slate-400 mb-6">or click to browse from your computer</p>
            <span className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full font-medium transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]">
              Select Files
            </span>
          </label>
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
                  <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden hidden md:block">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-sm font-mono">{progress}%</span>
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
                type="text"
                placeholder="Search files..."
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
          {loading ? (
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
                  className={`glass group transition-all cursor-pointer relative overflow-hidden ${viewMode === "grid" ? "rounded-2xl p-6 flex flex-col justify-between h-48 hover:scale-[1.02]" : "rounded-xl p-3 sm:p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 hover:bg-slate-800/50"}`} 
                  onClick={() => setCurrentPath(folder.name)}
                >
                  <div className={viewMode === "grid" ? "" : "flex items-center gap-4 flex-1 min-w-0"}>
                    <Folder className={`text-blue-400 fill-blue-400/20 ${viewMode === "grid" ? "w-10 h-10 mb-4" : "w-6 h-6 flex-shrink-0"}`} />
                    <h4 className={`font-semibold truncate ${viewMode === "grid" ? "text-lg pr-16" : "text-sm"}`} title={folder.name.split("/").filter(Boolean).pop()}>
                      {folder.name.split("/").filter(Boolean).pop()}
                    </h4>
                  </div>
                  
                  <div className={viewMode === "grid" ? "flex justify-between items-center text-sm text-slate-400 mt-4" : "hidden sm:flex items-center gap-6 w-32 md:w-48 text-sm text-slate-400 flex-shrink-0"}>
                    <span>Folder</span>
                    {viewMode === "list" && <span>-</span>}
                  </div>

                  <div className={viewMode === "grid" ? "absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-20" : "opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-20 w-full sm:w-auto justify-end mt-2 sm:mt-0"}>
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
                  className={`glass group transition-all relative overflow-hidden ${viewMode === "grid" ? "rounded-2xl p-6 flex flex-col justify-between h-48 hover:scale-[1.02]" : "rounded-xl p-3 sm:p-4 flex flex-wrap sm:flex-nowrap items-center gap-4 hover:bg-slate-800/50"}`}
                >
                  <div className={viewMode === "grid" ? "" : "flex items-center gap-4 flex-1 min-w-0"}>
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
                      <h4 className={`font-semibold truncate ${viewMode === "grid" ? "text-lg pr-16" : "text-sm"}`} title={getCleanFileName(file.key).split("/").pop()}>
                        {getCleanFileName(file.key).split("/").pop()}
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
