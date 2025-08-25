import { useAuth } from "@/hooks/use-auth";
import { useEffect, useRef, useState, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AudioRecording, User } from "@shared/schema";
import {
  Mic,
  X,
  Play,
  Download,
  Trash2,
  StopCircle,
  Loader2,
  AlertTriangle,
  HardDrive
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import AudioTimeline from "@/components/audio-timeline";

export default function AdminAudio() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [selectedRecording, setSelectedRecording] = useState<(AudioRecording & { user: User }) | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch active recordings
  const { data: activeRecordings, isLoading: activeLoading } = useQuery<(AudioRecording & { user: User })[]>({
    queryKey: ["/api/admin/audio/active"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch all recordings
  const { data: allRecordings, isLoading: recordingsLoading } = useQuery<(AudioRecording & { user: User })[]>({
    queryKey: ["/api/admin/audio/recordings"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const stopRecordingMutation = useMutation({
    mutationFn: async (recordingId: string) => {
      const res = await apiRequest("POST", `/api/admin/audio/stop/${recordingId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/recordings"] });
      toast({
        title: "Recording stopped",
        description: "Audio recording has been stopped successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to stop recording",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/admin/audio/cleanup");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/recordings"] });
      toast({
        title: "Cleanup completed",
        description: "Old audio files have been removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Cleanup failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteRecordingMutation = useMutation({
    mutationFn: async (recordingId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/audio/${recordingId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/recordings"] });
      toast({
        title: "Recording deleted",
        description: "Audio recording has been removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // WebSocket connection for real-time audio control
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('Audio panel WebSocket connected');
      setWs(websocket);
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Audio WebSocket message:', data);
        
        // Refresh data when audio events are received
        if (data.type === 'audio_start' || data.type === 'audio_stop') {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/active"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/audio/recordings"] });
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    websocket.onclose = () => {
      console.log('Audio panel WebSocket disconnected');
      setWs(null);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      websocket.close();
    };
  }, []);

  useEffect(() => {
    if (selectedRecording && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.src = selectedRecording.fileUrl!;
      audioRef.current.play().then(() => {
        toast({
          title: "Audio playback",
          description: `Playing ${selectedRecording.fileName}`,
        });
      }).catch((error) => {
        console.error('Audio play error:', error);
        toast({
          title: "Playback failed",
          description: error.message,
          variant: "destructive",
        });
      });
    }
  }, [selectedRecording]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  const calculateTotalStorage = (): { totalSize: number, totalFiles: number } => {
    if (!allRecordings) return { totalSize: 0, totalFiles: 0 };
    
    const totalSize = allRecordings.reduce((sum, recording) => sum + (recording.fileSize || 0), 0);
    return {
      totalSize,
      totalFiles: allRecordings.length,
    };
  };

  const { totalSize, totalFiles } = calculateTotalStorage();

  const handleStopRecording = (recordingId: string) => {
    if (confirm("Are you sure you want to stop this recording?")) {
      stopRecordingMutation.mutate(recordingId);
    }
  };

  const handleDownload = (recording: AudioRecording & { user: User }) => {
    if (!recording.fileUrl) {
      toast({
        title: "Download failed",
        description: "Audio file not available",
        variant: "destructive",
      });
      return;
    }
    
    // Create download link
    const link = document.createElement('a');
    link.href = recording.fileUrl;
    link.download = recording.fileName || 'audio-recording.webm';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Download started",
      description: `Downloading ${recording.fileName}`,
    });
  };

  const handlePlay = (recording: AudioRecording & { user: User }) => {
    if (!recording.fileUrl) {
      toast({
        title: "Playback failed",
        description: "Audio file not available",
        variant: "destructive",
      });
      return;
    }
    if (selectedRecording?.id === recording.id) {
      setSelectedRecording(null);
    } else {
      setSelectedRecording(recording);
    }
  };

  const handleDelete = (recordingId: string) => {
    if (confirm("Are you sure you want to delete this recording? This action cannot be undone.")) {
      deleteRecordingMutation.mutate(recordingId);
    }
  };

  const handleCleanup = () => {
    if (confirm("Are you sure you want to clean up old files? This will permanently delete recordings older than 7 days.")) {
      cleanupMutation.mutate();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-red-50 border-b border-red-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Mic className="text-red-600 mr-3 h-6 w-6" />
              <h1 className="text-2xl font-bold text-red-900" data-testid="text-audio-panel-title">
                Audio Monitoring Panel
              </h1>
              <Badge className="ml-4 bg-red-200 text-red-800 hover:bg-red-200">
                <AlertTriangle className="mr-1 h-3 w-3" />
                RESTRICTED ACCESS
              </Badge>
            </div>
            <Link href="/admin">
              <Button 
                variant="ghost" 
                className="text-red-600 hover:text-red-800 hover:bg-red-100"
                data-testid="button-close-panel"
              >
                <X className="mr-2 h-4 w-4" />
                Close Panel
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Active Recording Sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              Active Recording Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {activeRecordings?.map((recording) => (
                  <div 
                    key={recording.id}
                    className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200"
                    data-testid={`active-recording-${recording.id}`}
                  >
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-3"></div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {recording.user.username} ({recording.user.employeeId})
                        </p>
                        <p className="text-sm text-gray-600">
                          Recording since {new Date(recording.createdAt!).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })} • Duration: {recording.duration ? formatDuration(recording.duration) : "Calculating..."}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      onClick={() => handleStopRecording(recording.id)}
                      disabled={stopRecordingMutation.isPending}
                      data-testid={`button-stop-${recording.id}`}
                    >
                      {stopRecordingMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <StopCircle className="mr-2 h-4 w-4" />
                      )}
                      Stop Recording
                    </Button>
                  </div>
                ))}

                {!activeRecordings || activeRecordings.length === 0 ? (
                  <div className="text-center py-8 text-gray-500" data-testid="text-no-active-recordings">
                    No active recording sessions
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recording History */}
        <Card>
          <CardHeader>
            <CardTitle>Recording History</CardTitle>
          </CardHeader>
          <CardContent>
            {recordingsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>File Size</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allRecordings?.map((recording) => (
                      <Fragment key={recording.id}>
                        <TableRow data-testid={`row-recording-${recording.id}`}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-gray-900">
                                {recording.user.username}
                              </div>
                              <div className="text-sm text-gray-500">
                                {recording.user.employeeId}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(recording.recordingDate)}</TableCell>
                          <TableCell>
                            {recording.duration ? formatDuration(recording.duration) : "N/A"}
                          </TableCell>
                          <TableCell>
                            {recording.fileSize ? formatFileSize(recording.fileSize) : "N/A"}
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-primary hover:text-blue-700"
                                onClick={() => handlePlay(recording)}
                                data-testid={`button-play-${recording.id}`}
                              >
                                <Play className="h-4 w-4 mr-1" />
                                {selectedRecording?.id === recording.id ? 'Hide' : 'Play'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-primary hover:text-blue-700"
                                onClick={() => handleDownload(recording)}
                                data-testid={`button-download-${recording.id}`}
                              >
                                <Download className="h-4 w-4 mr-1" />
                                Download
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleDelete(recording.id)}
                                data-testid={`button-delete-${recording.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {selectedRecording?.id === recording.id && (
                          <TableRow>
                            <TableCell colSpan={5}>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium truncate">{recording.fileName}</span>
                                  <Button variant="ghost" size="sm" onClick={() => setSelectedRecording(null)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                                <audio ref={audioRef} controls className="w-full" />
                                {recording.fileUrl && (
                                  <AudioTimeline
                                    fileUrl={recording.fileUrl}
                                    startTime={recording.createdAt ?? undefined}
                                    duration={recording.duration || 0}
                                    audioRef={audioRef}
                                  />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                    {!allRecordings || allRecordings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                          No audio recordings found
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Storage Management */}
        <Card data-testid="card-storage-management">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Storage Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900" data-testid="text-total-storage">
                  {formatFileSize(totalSize)}
                </p>
                <p className="text-sm text-gray-600">Total Storage Used</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900" data-testid="text-total-recordings">
                  {totalFiles}
                </p>
                <p className="text-sm text-gray-600">Total Recordings</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">7 days</p>
                <p className="text-sm text-gray-600">Auto-Delete After</p>
              </div>
            </div>
            
            <div className="text-center">
              <Button 
                variant="destructive"
                onClick={handleCleanup}
                disabled={cleanupMutation.isPending}
                data-testid="button-cleanup"
              >
                {cleanupMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Clean Up Old Files
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
