import React, { useEffect, useRef } from 'react';

interface AdsterraBannerProps {
  isPro: boolean;
}

export function AdsterraBanner({ isPro }: AdsterraBannerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isPro || !containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';

    const iframe = document.createElement('iframe');
    iframe.width = '320';
    iframe.height = '50';
    iframe.style.border = 'none';
    iframe.style.overflow = 'hidden';
    iframe.style.display = 'block';
    iframe.scrolling = 'no';
    iframe.title = 'Sponsored Banner';

    container.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:transparent;display:flex;justify-content:center;align-items:center;">
  <script type="text/javascript">
    atOptions = {
      'key' : '25f639edb87afeac539b8b80393b5fdd',
      'format' : 'iframe',
      'height' : 50,
      'width' : 320,
      'params' : {}
    };
  <\/script>
  <script type="text/javascript" data-cfasync="false" src="https://bicea.org/22/25f639edb87afeac539b8b80393b5fdd"><\/script>
</body>
</html>`);
      doc.close();
    }

    return () => {
      container.innerHTML = '';
    };
  }, [isPro]);

  if (isPro) return null;

  return (
    <div className="fixed inset-x-0 bottom-14 z-20 flex justify-center border-t border-slate-200/80 bg-white/95 py-1 backdrop-blur-xs lg:bottom-0">
      <div ref={containerRef} className="h-[50px] w-[320px] overflow-hidden" />
    </div>
  );
}
