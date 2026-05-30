interface ClonePlaylistButtonProps {
  onClone?: () => void;
}

export function ClonePlaylistButton({ onClone }: ClonePlaylistButtonProps) {
  return <button onClick={onClone} type="button">Clone Playlist</button>;
}
