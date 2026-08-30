function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function isNetworkData(value) {
  return Boolean(value
    && Array.isArray(value.sectors)
    && Array.isArray(value.assets)
    && Array.isArray(value.personnel));
}

export function createSectorsStore(seed) {
  let data = clone(seed);
  const state = {
    selectedSectorId: data.sectors[0]?.id || null,
    selected: data.sectors[0] ? { kind: 'sector', id: data.sectors[0].id } : null,
    view: 'strategic',
    expanded: new Set(data.sectors.slice(0, 2).map(sector => sector.id)),
    session: { role: 'member', permissions: [], authenticated: false, source: 'static-pages' }
  };
  const listeners = new Set();

  function emit() {
    for (const listener of listeners) listener(getSnapshot());
  }

  function getSnapshot() {
    return { data, state };
  }

  function replaceData(nextData) {
    if (!isNetworkData(nextData)) return false;
    data = clone(nextData);

    const sectorIds = new Set(data.sectors.map(sector => sector.id));
    state.expanded = new Set([...state.expanded].filter(id => sectorIds.has(id)));

    if (!sectorIds.has(state.selectedSectorId)) {
      state.selectedSectorId = data.sectors[0]?.id || null;
      state.selected = state.selectedSectorId ? { kind: 'sector', id: state.selectedSectorId } : null;
    } else if (state.selected?.kind === 'sector') {
      if (!sectorIds.has(state.selected.id)) {
        state.selected = state.selectedSectorId ? { kind: 'sector', id: state.selectedSectorId } : null;
      }
    } else if (state.selected?.kind === 'asset') {
      const selectedAsset = data.assets.find(asset => asset.id === state.selected.id);
      if (!selectedAsset) {
        state.selected = state.selectedSectorId ? { kind: 'sector', id: state.selectedSectorId } : null;
      } else if (selectedAsset.sectorId && sectorIds.has(selectedAsset.sectorId)) {
        state.selectedSectorId = selectedAsset.sectorId;
      }
    } else if (state.selected?.kind === 'person') {
      const selectedPerson = data.personnel.find(person => person.id === state.selected.id);
      if (!selectedPerson) {
        state.selected = state.selectedSectorId ? { kind: 'sector', id: state.selectedSectorId } : null;
      } else if (selectedPerson.sectorId && sectorIds.has(selectedPerson.sectorId)) {
        state.selectedSectorId = selectedPerson.sectorId;
      }
    }

    if (state.selectedSectorId) state.expanded.add(state.selectedSectorId);
    emit();
    return true;
  }

  const liveNetworkListener = event => {
    replaceData(event.detail?.data ?? event.detail);
  };
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('dni:sectors-network-data', liveNetworkListener);
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(getSnapshot());
      return () => listeners.delete(listener);
    },
    snapshot: getSnapshot,
    setSession(session) {
      state.session = { ...state.session, ...session };
      emit();
    },
    replaceData,
    selectSector(id) {
      if (!data.sectors.some(sector => sector.id === id)) return;
      state.selectedSectorId = id;
      state.selected = { kind: 'sector', id };
      state.expanded.add(id);
      emit();
    },
    select(kind, id) {
      if (kind === 'sector') return this.selectSector(id);
      const exists = kind === 'asset'
        ? data.assets.some(asset => asset.id === id)
        : data.personnel.some(person => person.id === id);
      if (!exists) return;
      state.selected = { kind, id };
      const entity = kind === 'asset'
        ? data.assets.find(asset => asset.id === id)
        : data.personnel.find(person => person.id === id);
      if (entity?.sectorId) state.selectedSectorId = entity.sectorId;
      emit();
    },
    setView(view) {
      if (!['strategic', 'assets', 'personnel'].includes(view)) return;
      state.view = view;
      emit();
    },
    toggleSector(id) {
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      emit();
    },
    applyServerMutation(payload) {
      if (payload?.networkData) replaceData(payload.networkData);
      else if (payload?.data?.sectors && payload?.data?.assets) replaceData(payload.data);
    }
  };
}
