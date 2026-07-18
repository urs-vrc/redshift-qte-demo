const PixelArrow = ({ rotation }: { rotation: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: `rotate(${rotation})` }}>
    <rect x="8" y="4" width="8" height="4" fill="currentColor" />
    <rect x="4" y="8" width="16" height="4" fill="currentColor" />
    <rect x="0" y="12" width="24" height="4" fill="currentColor" />
    <rect x="8" y="16" width="8" height="4" fill="currentColor" />
    <rect x="8" y="20" width="8" height="4" fill="currentColor" />
  </svg>
);

export const PixelArrowUp = () => <PixelArrow rotation="0deg" />;
export const PixelArrowRight = () => <PixelArrow rotation="90deg" />;
export const PixelArrowDown = () => <PixelArrow rotation="180deg" />;
export const PixelArrowLeft = () => <PixelArrow rotation="270deg" />;
