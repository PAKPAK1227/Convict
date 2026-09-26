import { render, screen } from '@testing-library/react';
import TickerPanel from '../TickerPanel';

const row = {
  ticker: 'AAPL',
  company_name: 'Apple Inc',
  listed_name: 'APPLE INC',
  price: 230.5,
  price_at: '2026-09-25T20:00:00Z',
  week52_low: 170,
  week52_high: 260,
};

test('shows name, last close and the 52-week range', () => {
  render(<TickerPanel lookup={{ state: 'found', row }} />);
  expect(screen.getByText('Apple Inc')).toBeInTheDocument();
  expect(screen.getByText(/\$230\.5/)).toBeInTheDocument();
  expect(screen.getByText(/52w low \$170/)).toBeInTheDocument();
  expect(screen.getByText(/52w high \$260/)).toBeInTheDocument();
});

test('a listed ticker without a price yet says when it will appear', () => {
  render(<TickerPanel lookup={{ state: 'found', row: { ticker: 'NEWCO', listed_name: 'NEWCO CORP' } }} />);
  expect(screen.getByText('Newco Corp')).toBeInTheDocument();
  expect(screen.getByText(/after tonight's refresh/)).toBeInTheDocument();
});

test('an unknown ticker is flagged', () => {
  render(<TickerPanel lookup={{ state: 'unknown', row: null }} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/can't find that ticker/);
});

test('unavailable data never blocks the user', () => {
  render(<TickerPanel lookup={{ state: 'unavailable', row: null }} />);
  expect(screen.getByText(/you can still continue/)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('renders nothing before a valid ticker is typed', () => {
  const { container } = render(<TickerPanel lookup={{ state: 'idle', row: null }} />);
  expect(container).toBeEmptyDOMElement();
});
