import { fireEvent, render, screen } from '@testing-library/react';
import TargetFields from '../TargetFields';
import { METRIC_OPTIONS } from '../../lib/metrics';

function renderFields(props = {}) {
  const handlers = {
    onMetricChange: jest.fn(),
    onDirectionChange: jest.fn(),
    onTargetChange: jest.fn(),
  };
  render(
    <TargetFields
      options={METRIC_OPTIONS}
      metricName="price"
      direction=""
      targetValue=""
      inputClass=""
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

test('a price target offers at least / at most / within ±5%', () => {
  const { onDirectionChange } = renderFields();
  fireEvent.click(screen.getByRole('button', { name: 'At most' }));
  expect(onDirectionChange).toHaveBeenCalledWith('at_most');
  expect(screen.getByRole('button', { name: 'Within ±5%' })).toBeInTheDocument();
});

test('explains the chosen direction', () => {
  renderFields({ direction: 'at_most' });
  expect(screen.getByText(/bet against the stock/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'At most' })).toHaveAttribute('aria-pressed', 'true');
});

test("shows how far the target is from today's close", () => {
  renderFields({ direction: 'at_least', targetValue: '220', referencePrice: 200 });
  expect(screen.getByText(/10\.0% above it/)).toBeInTheDocument();
});

test('warns when a within-band call already contains today\'s price', () => {
  renderFields({ direction: 'within', targetValue: '205', referencePrice: 200 });
  expect(screen.getByText(/won't count toward your score/)).toBeInTheDocument();
});

test('no warning when the band is away from today\'s price', () => {
  renderFields({ direction: 'within', targetValue: '250', referencePrice: 200 });
  expect(screen.queryByText(/won't count toward your score/)).toBeNull();
});

test('fundamentals show no direction choice', () => {
  renderFields({ metricName: 'pe_ratio' });
  expect(screen.queryByRole('group', { name: 'Price target direction' })).toBeNull();
});
