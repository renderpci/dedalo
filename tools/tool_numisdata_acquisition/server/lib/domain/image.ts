export interface LotImage {
	id: number;
	lotId: number;
	sourceUrl: string;
	localPath: string | null;
	imageOrder: number;
	width: number | null;
	height: number | null;
	downloadedAt: string | null;
}

export type AcquisitionMethod = 'http' | 'browser' | 'local-file';
export type AcquisitionStatus = 'success' | 'blocked' | 'failed' | 'unsupported';

export interface AcquisitionRun {
	id: number;
	url: string;
	startedAt: string;
	completedAt: string | null;
	status: AcquisitionStatus;
	acquisitionMethod: AcquisitionMethod;
	errorMessage: string | null;
	rawFilePath: string | null;
	auctionId: number | null;
	/** Page-by-page progress while the run is still in flight (completedAt === null). */
	currentPage: number | null;
	totalPages: number | null;
}
