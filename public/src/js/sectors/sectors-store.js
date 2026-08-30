function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
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
    replaceData(nextData) {
      data = clone(nextData);
      if (!data.sectors.some(sector => sector.id === state.selectedSectorId)) {
        state.selectedSectorId = data.sectors[0]?.id || null;
        state.selected = state.selectedSectorId ? { kind: 'sector', id: state.selectedSectorId } : null;
      }
      emit();
    },
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
      if (payload?.networkData) data = clone(payload.networkData);
      else if (payload?.data?.sectors && payload?.data?.assets) data = clone(payload.data);
      else return;
      emit();
    }
  };
}
