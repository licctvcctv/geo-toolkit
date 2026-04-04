export interface VisualizationDisplayState {
  uploadedRows: number;
  calculatedRows: number;
}

export function shouldRenderVisualization(state: VisualizationDisplayState): boolean {
  return state.uploadedRows > 0 && state.calculatedRows > 0;
}
