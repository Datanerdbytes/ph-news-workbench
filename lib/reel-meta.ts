// Reads the track duration from an MP4/MOV container's mvhd atom so the
// server can enforce Reel length without a media library.
type BoxRange = { start: number; end: number };

function findBox(
  buffer: Buffer,
  from: number,
  to: number,
  type: string
): BoxRange | null {
  let offset = from;
  while (offset + 8 <= to) {
    let size = buffer.readUInt32BE(offset);
    const boxType = buffer.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > to) return null;
      size = Number(buffer.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = to - offset;
    }
    if (size < header || offset + size > to) return null;
    if (boxType === type) {
      return { start: offset + header, end: offset + size };
    }
    offset += size;
  }
  return null;
}

export function readMp4DurationSeconds(buffer: Buffer): number | null {
  const moov = findBox(buffer, 0, buffer.length, 'moov');
  if (!moov) return null;
  const mvhd = findBox(buffer, moov.start, moov.end, 'mvhd');
  if (!mvhd) return null;

  const payloadLength = mvhd.end - mvhd.start;
  const version = buffer.readUInt8(mvhd.start);
  if (version === 1) {
    if (payloadLength < 32) return null;
    const timescale = buffer.readUInt32BE(mvhd.start + 20);
    const duration = Number(buffer.readBigUInt64BE(mvhd.start + 24));
    return timescale > 0 ? duration / timescale : null;
  }
  if (payloadLength < 20) return null;
  const timescale = buffer.readUInt32BE(mvhd.start + 12);
  const duration = buffer.readUInt32BE(mvhd.start + 16);
  return timescale > 0 ? duration / timescale : null;
}
