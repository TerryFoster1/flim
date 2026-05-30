interface RouletteButtonProps {
  onSpin?: () => void;
}

export function RouletteButton({ onSpin }: RouletteButtonProps) {
  return <button className="spin-button" onClick={onSpin} type="button">Spin</button>;
}
