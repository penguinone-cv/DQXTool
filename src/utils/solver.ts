import type { ForgeState } from './forgeCoreEngine';

export interface WorkerRecommendation {
  move: {
    actionName: string;
    targets: number[];
  };
  expectedScore: number;
  greatSuccessRate: number;
  successRate: number;
}

export interface Solver {
  recommend(state: ForgeState): Promise<WorkerRecommendation[]>;
}

export class ModelSolver implements Solver {
  private apiUrl: string;

  constructor(apiUrl: string = 'http://localhost:3001') {
    this.apiUrl = apiUrl;
  }

  async recommend(state: ForgeState): Promise<WorkerRecommendation[]> {
    try {
      const response = await fetch(`${this.apiUrl}/api/recommend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Inference API error: ${response.statusText}. Details: ${errText}`);
      }

      const data = await response.json();
      return data as WorkerRecommendation[];
    } catch (err: any) {
      console.error('Failed to get recommendation from model solver:', err.message);
      throw err;
    }
  }
}
