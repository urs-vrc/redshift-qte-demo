import React from 'react';

const PixelArrow = ({ rotation }: { rotation: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: `rotate(${rotation})` }}>
    <rect x="10" y="4" width="4" height="16" fill="currentColor" />
    <rect x="6" y="8" width="4" height="4" fill="currentColor" />
    <rect x="14" y="8" width="4" height="4" fill="currentColor" />
    <rect x="2" y="12" width="4" height="4" fill="currentColor" />
    <rect x="18" y="12" width="4" height="4" fill="currentColor" />
  </svg>
);

export const PixelArrowUp = () => <PixelArrow rotation="0deg" />;
export const PixelArrowRight = () => <PixelArrow rotation="90deg" />;
export const PixelArrowDown = () => <PixelArrow rotation="180deg" />;
export const PixelArrowLeft = () => <PixelArrow rotation="270deg" />;
