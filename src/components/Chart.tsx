import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface ChartProps {
  option: EChartsOption;
  height?: number;
}

export const Chart = ({ option, height = 320 }: ChartProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const buildOption = (input: EChartsOption) => {
    const baseTooltip = {
      backgroundColor: 'rgba(11, 19, 36, 0.95)',
      borderColor: 'rgba(0, 217, 255, 0.35)',
      borderWidth: 1,
      textStyle: { color: '#e6f0ff', fontSize: 12 },
      extraCssText:
        'box-shadow: 0 14px 28px rgba(0,0,0,0.35); border-radius: 12px; padding: 10px 12px;'
    } as const;

    const tooltip = (input as any).tooltip;
    if (!tooltip) {
      return { ...input, tooltip: baseTooltip };
    }
    if (Array.isArray(tooltip)) {
      return input;
    }
    return {
      ...input,
      tooltip: {
        ...baseTooltip,
        ...tooltip,
        textStyle: { ...baseTooltip.textStyle, ...(tooltip.textStyle || {}) }
      }
    };
  };

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    chart.setOption(buildOption(option), true);

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, []);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(buildOption(option), true);
    }
  }, [option]);

  return <div ref={ref} style={{ width: '100%', height }} />;
};
