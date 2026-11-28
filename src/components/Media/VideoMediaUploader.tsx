import React, { useState } from 'react';
import { 
  Video, Upload, Play, Trash2, FileText, Download, 
  Sparkles, CheckCircle2, Film, AlertCircle, Eye, Info
} from 'lucide-react';
import { AppData, MediaAttachment } from '../../types';

interface VideoMediaUploaderProps {
  data: AppData;
  onUpdateData: (updater: (prev: AppData) => AppData) => void;
  isHindi?: boolean;
}

export const VideoMediaUploader: React.FC<VideoMediaUploaderProps> = ({
  data,
  onUpdateData,
  isHindi = true
}) => {
  const mediaList = data.mediaAttachments || [];

  const [activeVideo, setActiveVideo] = useState<MediaAttachment | null>(
    mediaList.length > 0 ? mediaList[0] : null
  );
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Software Demo Video');
  const [notes, setNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

      const newMedia: MediaAttachment = {
        id: 'vid_' + Date.now(),
        title: title.trim() || file.name,
        type: 'VIDEO',
        fileUrl: result,
        fileName: file.name,
        fileSize: sizeMb,
        uploadedAt: new Date().toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric'
        }),
        category,
        notes: notes.trim()
      };

      onUpdateData(prev => ({
        ...prev,
        mediaAttachments: [newMedia, ...(prev.mediaAttachments || [])]
      }));

      setActiveVideo(newMedia);
      setTitle('');
      setNotes('');
      setIsUploading(false);
      setSuccessMsg(isHindi ? 'वीडियो सफलतापूर्वक अपलोड हो गया!' : 'Video uploaded successfully!');

      setTimeout(() => setSuccessMsg(null), 3000);
    };

    reader.onerror = () => {
      setIsUploading(false);
      setErrorMsg(isHindi ? 'वीडियो अपलोड में समस्या आई।' : 'Failed to read video file.');
      setTimeout(() => setErrorMsg(null), 4000);
    };

    reader.readAsDataURL(file);
  };

  const handleAddSampleDemoVideo = () => {
    // Sample HTML5 video URL for demo
    const sampleVideo: MediaAttachment = {
      id: 'vid_sample_' + Date.now(),
      title: isHindi ? 'जीएसटी रिटर्न और इनवॉइसिंग डेमो ट्यूटोरियल' : 'GST Return & Invoicing Demo Tutorial',
      type: 'VIDEO',
      fileUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      fileName: 'GST_Return_Invoicing_Guide.mp4',
      fileSize: '15.4 MB',
      uploadedAt: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      category: 'Software Demo Video',
      notes: isHindi ? 'सॉफ्टवेयर उपयोग और जीएसटी रिटर्न एक्सेल/जेसन एक्सपोर्ट का संपूर्ण वीडियो गाइड' : 'Complete video guide on app usage and GSTR export.'
    };

    onUpdateData(prev => ({
      ...prev,
      mediaAttachments: [sampleVideo, ...(prev.mediaAttachments || [])]
    }));

    setActiveVideo(sampleVideo);
    setSuccessMsg(isHindi ? 'नमूना ट्यूटोरियल वीडियो जोड़ा गया!' : 'Sample video tutorial added!');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleDeleteVideo = (id: string) => {
    setPendingDeleteId(id);
  };

  const confirmDeleteVideo = () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    onUpdateData(prev => ({
      ...prev,
      mediaAttachments: (prev.mediaAttachments || []).filter(v => v.id !== id)
    }));

    if (activeVideo?.id === id) {
      const remaining = (data.mediaAttachments || []).filter(v => v.id !== id);
      setActiveVideo(remaining[0] || null);
    }
    setPendingDeleteId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="hv-surface p-5 rounded-2xl border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl hv-pill-amber border flex items-center justify-center shrink-0">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-[var(--text-primary)] flex items-center gap-2">
              {isHindi ? '🎥 वीडियो एवं मीडिया गैलरी केंद्र' : '🎥 Video & Media Upload Center'}
              <span className="hv-pill-amber border text-[10px] font-bold px-2 py-0.5 rounded-full">
                Media Module
              </span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {isHindi 
                ? 'वेबसाइट, कंपनी प्रेजेंटेशन और ऑडिट के लिए वीडियो क्लिप अपलोड एवं प्रबंधित करें।' 
                : 'Upload, manage, and play product demo clips, company presentations, and proof videos.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddSampleDemoVideo}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs shadow-lg transition transform active:scale-95 shrink-0 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isHindi ? '+ डेमो वीडियो जोड़ें' : '+ Add Sample Demo Video'}</span>
        </button>
      </div>

      {successMsg && (
        <div className="hv-pill-emerald border p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="hv-pill-rose border p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Player + Upload Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Player & Active Details */}
        <div className="lg:col-span-2 space-y-4">
          <div className="hv-surface rounded-2xl overflow-hidden shadow-2xl">
            {activeVideo ? (
              <div className="space-y-3">
                <div className="bg-black aspect-video relative flex items-center justify-center overflow-hidden">
                  <video
                    key={activeVideo.id}
                    controls
                    autoPlay={false}
                    className="w-full h-full object-contain"
                    src={activeVideo.fileUrl}
                  >
                    {isHindi ? 'आपका ब्राउज़र वीडियो प्ले करने में असमर्थ है।' : 'Your browser does not support playing this video.'}
                  </video>
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-block px-2 py-0.5 rounded-md hv-pill-indigo border text-[10px] font-bold mb-1">
                        {activeVideo.category || 'General Video'}
                      </span>
                      <h3 className="text-base font-bold text-[var(--text-primary)]">{activeVideo.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={activeVideo.fileUrl}
                        download={activeVideo.fileName}
                        className="p-2 rounded-xl hv-elevated hover:bg-[var(--hover-surface)] text-[var(--text-primary)] transition"
                        title="Download Video"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleDeleteVideo(activeVideo.id)}
                        className="p-2 rounded-xl hv-pill-rose hover:opacity-80 border transition cursor-pointer"
                        title="Delete Video"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] pt-1 border-t border-[var(--border-primary)]">
                    <span><strong>File:</strong> {activeVideo.fileName}</span>
                    <span><strong>Size:</strong> {activeVideo.fileSize}</span>
                    <span><strong>Date:</strong> {activeVideo.uploadedAt}</span>
                  </div>

                  {activeVideo.notes && (
                    <p className="text-xs hv-elevated p-2.5 rounded-xl text-[var(--text-secondary)]">
                      💡 <strong>Note:</strong> {activeVideo.notes}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center space-y-3">
                <Video className="w-16 h-16 text-[var(--text-muted)] mx-auto animate-pulse" />
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  {isHindi ? 'कोई वीडियो प्ले के लिए चयनित नहीं है' : 'No Video Selected for Playback'}
                </h3>
                <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                  {isHindi 
                    ? 'दाईं ओर से नया वीडियो अपलोड करें या गैलरी लिस्ट में से किसी वीडियो पर क्लिक करें।' 
                    : 'Upload a new video file on the right or pick a clip from your library below.'}
                </p>
              </div>
            )}
          </div>

          {/* Uploaded Videos Library List */}
          <div className="hv-surface rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center justify-between">
              <span>{isHindi ? 'अपलोड की गई वीडियो गैलरी' : 'Uploaded Video Library'} ({mediaList.length})</span>
            </h3>

            {mediaList.length === 0 ? (
              <div className="p-6 text-center text-[var(--text-muted)] text-xs italic">
                {isHindi ? 'अभी तक कोई वीडियो अपलोड नहीं किया गया है।' : 'No video clips uploaded yet.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mediaList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setActiveVideo(item)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between gap-3 ${
                      activeVideo?.id === item.id
                        ? 'hv-pill-indigo border-indigo-500 shadow-lg'
                        : 'hv-elevated text-[var(--text-primary)] hover:border-[var(--border-subtle)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-9 h-9 rounded-lg hv-pill-amber border flex items-center justify-center shrink-0">
                        <Play className="w-4 h-4 fill-current" />
                      </div>
                      <div className="truncate">
                        <h4 className="font-bold truncate text-[var(--text-primary)]">{item.title}</h4>
                        <span className="text-[10px] text-[var(--text-secondary)] block">{item.category} • {item.fileSize}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteVideo(item.id);
                      }}
                      className="text-[var(--text-muted)] hover:text-rose-400 p-1 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Upload New Video Form */}
        <div className="hv-surface rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-[var(--border-primary)] pb-3">
            <Upload className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
              {isHindi ? 'नया वीडियो अपलोड करें' : 'Upload New Video'}
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'वीडियो शीर्षक (Title)' : 'Video Title'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isHindi ? 'उदा. सॉफ्टवेयर प्रेजेंटेशन क्लिप' : 'e.g. Product Demo Clip'}
                className="w-full hv-input rounded-xl px-3 py-2 focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'श्रेणी (Category / Tag)' : 'Category / Tag'}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full hv-input rounded-xl px-3 py-2 focus:border-amber-500 outline-none"
              >
                <option value="Software Demo Video">Software Demo Video (डेमो ट्यूटोरियल)</option>
                <option value="GST Return Guide">GST Return Guide (जीएसटी गाइड)</option>
                <option value="Invoice Proof / Verification">Invoice Proof (इनवॉइस प्रूफ)</option>
                <option value="Company Introduction">Company Introduction (कंपनी प्रेजेंटेशन)</option>
                <option value="Audit Video Log">Audit Video Log (ऑडिट प्रूफ)</option>
              </select>
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'विवरण या नोट (Notes)' : 'Notes / Description'}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={isHindi ? 'वीडियो से संबंधित आवश्यक बातें लिखें...' : 'Additional notes regarding this video clip...'}
                className="w-full hv-input rounded-xl px-3 py-2 focus:border-amber-500 outline-none"
              />
            </div>

            <div className="pt-2">
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'वीडियो फ़ाइल चुनें (.mp4, .webm, .mov, .mkv)' : 'Choose Video File (.mp4, .webm, .mov)'}
              </label>
              <div className="relative border-2 border-dashed border-[var(--border-subtle)] hover:border-amber-500/60 rounded-2xl p-6 text-center cursor-pointer hv-elevated transition">
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <Video className="w-8 h-8 text-amber-400 mx-auto mb-2 animate-bounce" />
                <span className="text-xs font-bold text-[var(--text-primary)] block">
                  {isUploading 
                    ? (isHindi ? 'वीडियो अपलोड एवं प्रोसेस हो रहा है...' : 'Processing video upload...') 
                    : (isHindi ? 'यहाँ क्लिक करें या फ़ाइल ड्रैग करें' : 'Click here or drag video file')}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                  Supports MP4, WebM, OGG, MOV formats
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inline Video Delete Confirmation Modal */}
      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hv-surface border-rose-500/40 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>{isHindi ? 'वीडियो हटाने की पुष्टि करें' : 'Confirm Delete Video'}</span>
            </h4>
            <p className="text-xs text-[var(--text-secondary)]">
              {isHindi ? 'क्या आप इस वीडियो को हटाना चाहते हैं?' : 'Are you sure you want to delete this video?'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="px-3 py-1.5 rounded-xl hv-elevated hover:bg-[var(--hover-surface)] text-[var(--text-primary)] text-xs font-semibold cursor-pointer"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmDeleteVideo}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white hv-keep-white text-xs font-bold cursor-pointer"
              >
                {isHindi ? 'हाँ, हटाएं' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
