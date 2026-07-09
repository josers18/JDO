import { render } from '@testing-library/react';
import { Icon } from '@shared';

describe('Icon', () => {
  it('renders an svg for a known key', () => {
    const { container } = render(<Icon name="pipeline" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('applies the size prop to width/height', () => {
    const { container } = render(<Icon name="call" size={30} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('30');
    expect(svg.getAttribute('height')).toBe('30');
  });

  it('falls back to a circle svg for an unknown key', () => {
    // @ts-expect-error deliberate unknown key
    const { container } = render(<Icon name="nope" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
