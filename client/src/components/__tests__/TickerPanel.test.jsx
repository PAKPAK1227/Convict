import { fireEvent, render, screen } from '@testing-library/react';
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


test('shows the volatility profile with its reading', () => {
  render(
    <TickerPanel
      lookup={{
        state: 'found',
        row: { ...row, vol_mav: 0.2834, vol_m: 0.0841, vol_theta: 1.82, vol_window_days: 253 },
      }}
    />
  );
  expect(screen.getByText('28.3%')).toBeInTheDocument();
  expect(screen.getByText('8.4%')).toBeInTheDocument();
  expect(screen.getByText('1.82')).toBeInTheDocument();
  expect(screen.getByText('Directional')).toBeInTheDocument();
  expect(screen.getByText(/not a forecast/)).toBeInTheDocument();
});

test('explains when there is not enough history for volatility yet', () => {
  render(<TickerPanel lookup={{ state: 'found', row }} />);
  expect(screen.getByText(/three months of daily price history/)).toBeInTheDocument();
});


test('"What do these numbers mean?" opens a plain-English guide with this stock\'s numbers', () => {
  render(
    <TickerPanel
      lookup={{
        state: 'found',
        row: { ...row, vol_mav: 0.252, vol_m: 0.084, vol_theta: 1.82, vol_window_days: 253 },
      }}
    />
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByText('What do these numbers mean?'));

  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent(/typical day moves about 1\.6%/);   // 25.2% / sqrt(252)
  expect(dialog).toHaveTextContent(/traded between \$170 and \$260/);
  expect(dialog).toHaveTextContent(/Θ 1\.82: directional/);
  expect(dialog).toHaveTextContent(/not as a prediction/);

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('the guide still explains the numbers before volatility exists', () => {
  render(<TickerPanel lookup={{ state: 'found', row }} />);
  fireEvent.click(screen.getByText('What do these numbers mean?'));
  expect(screen.getByRole('dialog')).toHaveTextContent(/How violent/);
  expect(screen.getByRole('dialog')).not.toHaveTextContent(/This stock\s*[\d.]+% a year/);
});
