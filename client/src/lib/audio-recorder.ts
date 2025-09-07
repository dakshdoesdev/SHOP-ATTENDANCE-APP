import { API_BASE } from "./queryClient";

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private isRecording = false;
  private startTime: Date | null = null;
  private lastUploadAt: number | null = null;
  private chosenMimeType: string | null = null;
  private fileExtension: string = 'webm';

  private pickSupportedMime(): void {
    try {
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac'
      ];
      for (const t of candidates) {
        if ((window as any).MediaRecorder && (MediaRecorder as any).isTypeSupported && MediaRecorder.isTypeSupported(t)) {
          this.chosenMimeType = t;
          this.fileExtension = t.includes('mp4') || t.includes('aac') ? 'm4a' : 'webm';
          return;
        }
      }
      this.chosenMimeType = null;
      this.fileExtension = 'webm';
    } catch {
      this.chosenMimeType = null;
      this.fileExtension = 'webm';
    }
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) {
      console.log('🎤 Recording already in progress');
      return;
    }

    try {
      console.log('🎤 Requesting microphone access...');
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      this.pickSupportedMime();

      const options: MediaRecorderOptions = this.chosenMimeType
        ? { mimeType: this.chosenMimeType, audioBitsPerSecond: 128000 }
        : { audioBitsPerSecond: 128000 };

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.chunks = [];
      this.startTime = new Date();
      this.lastUploadAt = Date.now();

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
          console.log(`🎤 Audio chunk recorded: ${event.data.size} bytes`);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('🎤 MediaRecorder error:', event);
      };

      this.mediaRecorder.start(1000); // Record in 1-second chunks
      this.isRecording = true;
      
      console.log('🎤 Audio recording started successfully');
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Microphone access denied. Please allow microphone access and try again.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        }
      }
      throw error;
    }
  }

  async stopRecording(): Promise<Blob | null> {
    if (!this.isRecording || !this.mediaRecorder) {
      console.log('🔴 No active recording to stop');
      return null;
    }

    console.log('🔴 Stopping audio recording...');

    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: this.chosenMimeType || 'audio/webm' });
        const duration = this.startTime ? Math.floor((Date.now() - this.startTime.getTime()) / 1000) : 0;

        console.log(`🔴 Recording stopped - Duration: ${duration}s, Size: ${blob.size} bytes`);

        if (blob.size > 0) {
          await this.uploadAudio(blob, duration);
        } else {
          console.warn('⚠️ Recording blob is empty, skipping upload');
        }

        this.cleanup();
        resolve(blob);
      };

      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }

  private async uploadAudio(blob: Blob, duration: number): Promise<void> {
    try {
      console.log(`📤 Uploading audio blob: ${blob.size} bytes`);

      const formData = new FormData();
      const timestamp = Date.now();
      const filename = `recording-${timestamp}.${this.fileExtension}`;
      formData.append('audio', blob, filename);
      formData.append('duration', duration.toString());

      // Prefer bearer token if available (works in WebView/cross-origin)
      let headers: Record<string, string> | undefined;
      try {
        const token = localStorage.getItem('uploadToken');
        if (token) headers = { Authorization: `Bearer ${token}` };
      } catch {}

      const response = await fetch(`${API_BASE}/api/audio/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Audio upload failed: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      } else {
        const result = await response.json();
        console.log('✅ Audio upload successful:', result);
      }
    } catch (error) {
      console.error('❌ Audio upload error:', error);
      // Don't throw here to avoid breaking the UI flow
    }
  }

  // Upload a partial segment while still recording (does not stop the recorder)
  async uploadCurrentSegment(): Promise<void> {
    if (!this.isRecording) return;
    if (!this.mediaRecorder) return;
    // Build a blob from the chunks collected so far
    const pending = this.chunks;
    if (!pending || pending.length === 0) return;
    const blob = new Blob(pending, { type: this.chosenMimeType || 'audio/webm' });
    // Compute segment duration based on time since last upload
    const now = Date.now();
    let duration = 0;
    if (this.lastUploadAt) duration = Math.max(0, Math.floor((now - this.lastUploadAt) / 1000));
    this.lastUploadAt = now;
    // Reset chunks so subsequent data isn't re-uploaded
    this.chunks = [];
    // Perform upload if there is data
    if (blob.size > 0) {
      await this.uploadAudio(blob, duration);
    }
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop();
        console.log(`🔇 Stopped audio track: ${track.kind}`);
      });
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.startTime = null;
    console.log('🧹 Audio recorder cleaned up');
  }

  getRecordingState(): boolean {
    return this.isRecording;
  }

  getRecordingDuration(): number {
    if (!this.isRecording || !this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }
}

// Singleton instance for hidden recording
export const hiddenRecorder = new AudioRecorder();
