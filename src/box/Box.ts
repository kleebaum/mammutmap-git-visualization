import * as util from '../util'
import * as dom from '../domAdapter'
import { Path } from '../Path'
import { BoxMapData } from './BoxMapData'
import { Rect } from '../Rect'
import { DragManager } from '../DragManager'
import { DirectoryBox } from './DirectoryBox'

export abstract class Box {
  private readonly path: Path
  private readonly id: string
  private parent: DirectoryBox|null
  private mapData: BoxMapData = BoxMapData.buildDefault()
  private dragOffset: {x: number, y: number} = {x:0 , y:0} // TODO: move into DragManager and let DragManager return calculated position of box (instead of pointer)
  private hide: boolean = false // TODO: don't hide, use pointer-events: none; in style instead

  public constructor(path: Path, id: string, parent: DirectoryBox|null) {
    this.path = path
    this.id = id
    this.parent = parent
  }

  public getPath(): Path {
    return this.path
  }

  public getId(): string {
    return this.id
  }

  public getHeaderId(): string {
    return this.getId() + 'header'
  }

  public getParent(): DirectoryBox|never {
    if (this.parent == null) {
      util.logError('Box.getParent() cannot be called on root.')
    }
    return this.parent
  }

  public async getClientRect(): Promise<Rect> {
    // TODO: cache rect for better responsivity?
    // TODO: but then more complex, needs to be updated on many changes, also when parent boxes change
    return await dom.getClientRectOf(this.getId())
  }

  public render(): void {
    this.loadAndProcessMapData()
    this.renderHeader()
    this.renderBody()
  }

  private async loadAndProcessMapData():Promise<void> {
    if (!this.getPath().isRoot()) {
      await util.readFile(this.getPath().getMapPath() + '.json')
      .then(json => this.mapData = BoxMapData.buildFromJson(json))
      .catch(error => util.logWarning('failed to load ' + this.getPath().getMapPath() + '.json: ' + error))
    }
    await this.renderStyle()
  }

  protected renderStyle(): Promise<void> {
    let basicStyle: string = this.getDisplayStyle() + 'position:absolute;overflow:' + this.getOverflow() + ';'
    let scaleStyle: string = 'width:' + this.mapData.width + '%;height:' + this.mapData.height + '%;'
    let positionStyle: string = 'left:' + this.mapData.x + '%;top:' + this.mapData.y + '%;'
    let borderStyle: string = this.getBorderStyle()

    return dom.setStyleTo(this.getId(), basicStyle + scaleStyle + positionStyle + borderStyle)
  }

  private getDisplayStyle(): string {
    if (this.hide) {
      return 'display:none;'
    } else {
      return 'display:inline-block;'
    }
  }

  protected abstract getOverflow(): 'hidden'|'visible'

  protected abstract getBorderStyle(): string

  private async renderHeader(): Promise<void> {
    let headerElement: string = '<div id="' + this.getHeaderId() + '" style="background-color:skyblue;">' + this.getPath().getSrcName() + '</div>'
    await dom.setContentTo(this.getId(), headerElement)

    DragManager.addDraggable(this) // TODO: move to other method
  }

  public getDraggableId(): string {
    return this.getHeaderId()
  }

  public async dragStart(clientX: number, clientY: number): Promise<void> {
    let clientRect: Rect = await this.getClientRect()
    this.dragOffset = {x: clientX - clientRect.x, y: clientY - clientRect.y}

    this.hide = true
    this.renderStyle()
  }

  public async drag(clientX: number, clientY: number): Promise<void> {

  }

  public async dragCancel(): Promise<void> {
    this.hide = false
    this.renderStyle()
  }

  public async dragEnd(clientX: number, clientY: number, dropTarget: DirectoryBox): Promise<void> {
    let parent: DirectoryBox = this.getParent()
    let parentClientRect: Rect = await parent.getClientRect()

    if (parent != dropTarget) {
      const oldParent: DirectoryBox = parent
      const oldParentClientRect: Rect = parentClientRect
      parent = dropTarget
      this.parent = dropTarget
      parentClientRect = await parent.getClientRect()

      oldParent.removeBox(this)
      parent.addBox(this)

      this.mapData.width *= oldParentClientRect.width / parentClientRect.width
      this.mapData.height *= oldParentClientRect.height / parentClientRect.height
    }

    this.mapData.x = (clientX - parentClientRect.x - this.dragOffset.x) / parentClientRect.width * 100
    this.mapData.y = (clientY - parentClientRect.y - this.dragOffset.y) / parentClientRect.height * 100

    this.hide = false
    this.renderStyle()
  }

  protected abstract renderBody(): void

  /*private renderBody(): void {
    util.addContentTo(this.getId(), this.formBody())
  }

  protected abstract formBody(): string*/

}
