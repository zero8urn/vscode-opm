/**
 * Package details state management
 *
 * Manages the state of the package details panel.
 */

import type { PackageDetailsData } from '../../../services/packageDetailsService';

/**
 * Manages package details panel state
 */
export class DetailsState {
  private selectedPackageId: string | null = null;
  private packageDetails: PackageDetailsData | null = null;
  private panelOpen = false;
  private loading = false;
  private selectedSourceId: string | null = null;
  private selectedSourceName: string | null = null;

  /**
   * Set the selected package ID
   */
  setSelectedPackageId(packageId: string | null): void {
    this.selectedPackageId = packageId;
  }

  /**
   * Get the selected package ID
   */
  getSelectedPackageId(): string | null {
    return this.selectedPackageId;
  }

  /**
   * Set package details data
   */
  setPackageDetails(details: PackageDetailsData | null): void {
    this.packageDetails = details;
  }

  /**
   * Get package details data
   */
  getPackageDetails(): PackageDetailsData | null {
    return this.packageDetails;
  }

  /**
   * Set panel open state
   */
  setPanelOpen(open: boolean): void {
    this.panelOpen = open;
  }

  /**
   * Get panel open state
   */
  isPanelOpen(): boolean {
    return this.panelOpen;
  }

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.loading = loading;
  }

  /**
   * Get loading state
   */
  isLoading(): boolean {
    return this.loading;
  }

  /**
   * Set the selected source for this package
   */
  setSelectedSource(sourceId: string | null, sourceName: string | null): void {
    this.selectedSourceId = sourceId;
    this.selectedSourceName = sourceName;
  }

  /**
   * Get selected source ID
   */
  getSelectedSourceId(): string | null {
    return this.selectedSourceId;
  }

  /**
   * Get selected source name
   */
  getSelectedSourceName(): string | null {
    return this.selectedSourceName;
  }

  /**
   * Open the details panel for a package
   */
  openPanel(packageId: string, sourceId: string | null, sourceName: string | null): void {
    this.selectedPackageId = packageId;
    this.selectedSourceId = sourceId;
    this.selectedSourceName = sourceName;
    this.panelOpen = true;
    this.packageDetails = null; // Clear old details
  }

  /**
   * Close the details panel
   */
  closePanel(): void {
    this.panelOpen = false;
    this.selectedPackageId = null;
    this.packageDetails = null;
    this.loading = false;
    this.selectedSourceId = null;
    this.selectedSourceName = null;
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.closePanel();
  }
}
