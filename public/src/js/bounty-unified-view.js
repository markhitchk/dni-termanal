const panel = document.querySelector('[data-module="bountyboard"]');

function enforceUnifiedBoardView() {
  if (!panel) return;

  panel.querySelectorAll('.dni-bounty-altboards').forEach(node => node.remove());

  const label = panel.querySelector('.dni-bounty-board-tools strong');
  if (label) label.textContent = 'MAIN BOUNTY BOARD';

  const heading = panel.querySelector('.dni-bounty-main-header h2');
  const description = heading?.parentElement?.querySelector('p');
  if (heading?.textContent?.trim() === 'Main Bounty Board' && description) {
    description.textContent = 'One shared contract network for DNI members, Citizens, allied organizations, merchants, outside organizations, and independent issuers. Organization affiliation stays attached to each record; organizations do not create separate boards.';
  }
}

if (panel) {
  const observer = new MutationObserver(enforceUnifiedBoardView);
  observer.observe(panel, {childList:true, subtree:true});
  enforceUnifiedBoardView();
}
