const panel = document.querySelector('[data-module="bountyboard"]');

const setTextIfChanged = (node, value) => {
  if (node && node.textContent !== value) node.textContent = value;
};

function applyUnifiedContractView() {
  if (!panel) return;

  panel.querySelectorAll('.dni-bounty-altboards').forEach(node => node.remove());

  const label = panel.querySelector('.dni-bounty-board-tools strong');
  setTextIfChanged(label, 'MAIN BOUNTY BOARD');

  const heading = panel.querySelector('.dni-bounty-main-header h2');
  const description = heading?.parentElement?.querySelector('p');
  if (heading?.textContent?.trim() === 'Main Bounty Board' && description) {
    setTextIfChanged(
      description,
      'One shared contract network. Organization affiliation is attached to each record; organizations do not create separate boards.'
    );
  }
}

if (panel) {
  let scheduled = false;
  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyUnifiedContractView();
    });
  };

  new MutationObserver(scheduleApply).observe(panel, {childList:true, subtree:true});
  applyUnifiedContractView();
}
