import { Button } from '@/components/ui/button';
import { buildPageUrl } from '@/lib/helpers';

function AppPopup() {
  return (
    <div className="w-[420px] h-[600px] max-w-full flex flex-col bg-background">
      <Button
        onClick={() => {
          const url = buildPageUrl('home');
          chrome.tabs.create({
            url,
          });
        }}
      >
        Home
      </Button>
    </div>
  );
}

export default AppPopup;
