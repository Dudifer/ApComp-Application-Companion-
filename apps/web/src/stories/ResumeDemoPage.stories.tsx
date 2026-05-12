import type { Meta, StoryObj } from '@storybook/react';
import ResumeDemoPage from '../pages/ResumeDemoPage';

const meta: Meta<typeof ResumeDemoPage> = {
  title: 'Resume/ResumeDemoPage',
  component: ResumeDemoPage,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
**Interactive resume builder demo.**

- Drag the ⠿ handle on job cards to reorder them
- Uncheck bullet checkboxes to hide bullets from the PDF
- Click Hide/Show to toggle entire job entries
- Click any text to edit inline
- Watch the live PDF preview update on the right
- Click Export PDF to download
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ResumeDemoPage>;

export const Default: Story = {};

export const MobileWidth: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
