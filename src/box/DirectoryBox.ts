import * as util from '../util'
import * as dom from '../domAdapter'
import { Box } from './Box'
import { FileBox } from './FileBox'
import { FolderBoxHeader } from './FolderBoxHeader'
import { DragManager } from '../DragManager'

export class DirectoryBox extends Box {
  private boxes: Box[] = []
  private dragOver: boolean = false

  public constructor(id: string, name: string, parent: DirectoryBox|null) {
    super(id, name, parent)
  }

  protected createHeader(): FolderBoxHeader {
    return new FolderBoxHeader(this)
  }

  protected getOverflow(): 'visible' {
    return 'visible'
  }

  protected getAdditionalStyle(): string {
    if (this.dragOver) {
      return 'background-color:#33F6'
    } else {
      return 'background-color:#0000'
    }
  }

  public setDragOverStyle(value: boolean) {
    this.dragOver = value
    this.renderStyle()
  }

  protected renderBody(): void {
    util.readdirSync(this.getSrcPath()).forEach(file => {
      let fileName: string = file.name
      let filePath: string = this.getSrcPath() + '/' + fileName

      if (file.isDirectory()) {
        util.logInfo('Box::render directory ' + filePath)
        this.boxes.push(this.createDirectoryBox(fileName))

      } else if (file.isFile()) {
        util.logInfo('Box::render file ' + filePath)
        this.boxes.push(this.createFileBox(fileName))

      } else {
        util.logError('Box::render ' + filePath + ' is neither file nor directory.')
      }
    });

    this.boxes.forEach(box => {
      box.render()
    });

    DragManager.addDropTarget(this) // TODO: move to other method
  }

  private createDirectoryBox(name: string): DirectoryBox {
    const elementId: string = this.renderBoxPlaceholderAndReturnId(name)
    return new DirectoryBox(elementId, name, this)
  }

  private createFileBox(name: string): FileBox {
    const elementId: string = this.renderBoxPlaceholderAndReturnId(name)
    return new FileBox(elementId, name, this)
  }

  private renderBoxPlaceholderAndReturnId(name: string): string {
    const elementId: string = dom.generateElementId()
    dom.addContentTo(this.getId(), '<div id="' + elementId + '" style="display:inline-block;">loading... ' + name + '</div>')
    return elementId
  }

  private containsBox(box: Box): boolean {
    return this.boxes.includes(box)
  }

  public addBox(box: Box): void {
    if (this.containsBox(box)) {
      util.logWarning('DirectoryBox.addBox: trying to add box that is already contained')
    }
    this.boxes.push(box)
    dom.appendChildTo(this.getId(), box.getId())
  }

  public removeBox(box: Box): void {
    if (!this.containsBox(box)) {
      util.logWarning('DirectoryBox.removeBox: trying to remove box that is not contained')
    }
    this.boxes.splice(this.boxes.indexOf(box), 1)
    // TODO: try to remove from dom?
  }

  public async getBoxesAt(clientX: number, clientY: number): Promise<Box[]> {
    let boxesAtPostion:Box[] = []

    for (var i: number = 0; i < this.boxes.length; i++) {
      let box = this.boxes[i]
      let clientRect = await box.getClientRect() // TODO: parallelize, getBoxesAt(..) is called often
      if (clientRect.isPositionInside(clientX, clientY)) {
        boxesAtPostion.push(box)
      }
    }

    return boxesAtPostion
  }

}
