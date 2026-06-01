interface RouletteButtonProps {
  onSpin?: () => void;
  disabled?: boolean;
  label?: string;
}

export function RouletteButton({ disabled, label = "Now Playing", onSpin }: RouletteButtonProps) {
  return (
    <button className="spin-button" disabled={disabled} onClick={onSpin} type="button">
      {label}
    </button>
  );
}
