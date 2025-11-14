import { EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState, window } from 'vscode';
import { DomainProviderService } from '../domain/domainProviderService';

type SimpleNode = { id: string; label: string; collapsible?: boolean };

export class SimpleViewProvider implements TreeDataProvider<SimpleNode> {
  private _onDidChangeTreeData = new EventEmitter<SimpleNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: SimpleNode[] = [
    { id: '1', label: 'One' },
    { id: '2', label: 'Two' },
  ];

  constructor(private domainService: DomainProviderService) {}

  getTreeItem(node: SimpleNode): TreeItem {
    const item = new TreeItem(
      node.label,
      node.collapsible ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None,
    );
    item.id = node.id;
    item.command = { command: 'dpm.openItem', title: 'Open Item', arguments: [node.id] };
    item.contextValue = 'dpm.item';
    return item;
  }

  async getChildren(node?: SimpleNode) {
    if (!node) return this.items;
    return [];
  }

  getParent?(node: SimpleNode) {
    return undefined;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }
}
