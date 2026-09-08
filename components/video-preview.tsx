'use client';
export function VideoPreview({
  src,
  transcript,
}: {
  src: string;
  transcript?: string;
}) {
  const captions = transcript
    ? 'data:text/vtt;charset=utf-8,' +
      encodeURIComponent(
        'WEBVTT\n\n00:00.000 --> 00:08.000\n' +
          transcript.replace(/-->/g, '→') +
          '\n',
      )
    : undefined;
  return (
    <div>
      {/* Captions exist only when actual reviewed speech was returned. */}
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
      <video src={src} controls preload="metadata" className="media-preview">
        {captions && (
          <track
            default
            kind="captions"
            label="Generated transcript"
            srcLang="en"
            src={captions}
          />
        )}
      </video>
      <details className="small spaced">
        <summary>Audio transcript</summary>
        <p>{transcript ?? 'Transcript unavailable for this version.'}</p>
        {transcript === '' && (
          <p>No speech was detected in the finished clip.</p>
        )}
        <p className="muted">
          Machine transcription from the reviewed media. Verify wording during
          approval.
        </p>
      </details>
    </div>
  );
}
