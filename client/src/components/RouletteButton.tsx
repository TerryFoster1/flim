interface RouletteButtonProps {
  onSpin?: () => void;
  disabled?: boolean;
}

export function RouletteButton({ disabled, onSpin }: RouletteButtonProps) {
  return (
    <button className="spin-button" disabled={disabled} onClick={onSpin} type="button">
      Spin
    </button>
  );
}
