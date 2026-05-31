interface RouletteButtonProps {
  onSpin?: () => void;
  disabled?: boolean;
  label?: string;
}

export function RouletteButton({ disabled, label = "Start Projector", onSpin }: RouletteButtonProps) {
  return (
    <button className="spin-button" disabled={disabled} onClick={onSpin} type="button">
      {label}
    </button>
  );
}
