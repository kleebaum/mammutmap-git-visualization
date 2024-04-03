import { Box, BoxDepthTreeIterator, FolderBox, Link, ProgressBarWidget, coreUtil } from '../../dist/pluginFacade'
import * as bundler from './bundler'

export async function bundleLinks(startBox: Box, options: {
	mode: 'autoMaintained'|'all'
	bordering: boolean
	managed: boolean
	recursively: boolean
	pathsToIgnoreIfRecursively: string[]
}): Promise<void> {
	console.info(`Start bundling links of '${startBox.getSrcPath()}' with options '${JSON.stringify(options)}'...`)
	const progressBar: ProgressBarWidget = await ProgressBarWidget.newAndRenderInMainWidget()
	let countingFinished: boolean = false
	let boxCount: number = 1
	let linkCount: number = 0
	let processedBoxCount: number = 0
	let processedLinkCount: number = 0
	let currentBox: Box|undefined = startBox
	const counting: Promise<void> = count()

	if (options.bordering) {
		await bundleLinksSequentially(startBox.borderingLinks.getAll())
	}
	if (options.managed) {
		await bundleLinksSequentially(startBox.links.getLinks())
	}
	processedBoxCount++
	if (options.recursively && startBox instanceof FolderBox) {
		const iterator = new BoxDepthTreeIterator(startBox, {srcPathsToIgnore: options.pathsToIgnoreIfRecursively})
		while (await iterator.hasNextOrUnwatch()) {
			const nextBox: Box = await iterator.next()
			if (nextBox === startBox) {
				continue
			}
			currentBox = nextBox
			await bundleLinksSequentially(nextBox.links.getLinks())
			processedBoxCount++
			updateProgressBar()
		}
	}

	await counting
	await progressBar.finishAndRemove()
	currentBox = undefined
	console.info(`Finished ${buildProgressText()}.`)

	async function count(): Promise<void> {
		if (options.bordering) {
			linkCount += startBox.borderingLinks.getAll().length
		}
		if (options.managed) {
			linkCount += startBox.links.getLinks().length
		}
		updateProgressBar()
		if (options.recursively && startBox instanceof FolderBox) {
			const iterator = new BoxDepthTreeIterator(startBox, {srcPathsToIgnore: options.pathsToIgnoreIfRecursively})
			while (await iterator.hasNextOrUnwatch()) {
				const next: Box = await iterator.next()
				if (next === startBox) {
					continue
				}
				boxCount++
				linkCount += next.links.getLinks().length
				updateProgressBar()
			}
		}
		countingFinished = true
	}

	async function bundleLinksSequentially(links: Link[]): Promise<void> {
		for (const link of links) {
			await bundleLink(link)
		}
	}

	async function bundleLink(link: Link): Promise<void> {
		if (!link.getManagingBox().links.getLinks().includes(link)) {
			console.warn(`linkBundler::bundleLink(link: "${link.describe()}") link was removed in meanwhile.`)
			return
		}
		if (options.mode === 'all' || link.isAutoMaintained()) {
			await bundler.bundleLink(link, {unwatchDelayInMs: 500})
		}
		processedLinkCount++
		updateProgressBar()
	}

	async function updateProgressBar(): Promise<void> {
		//const linksPerBox: number = linkCount / boxCount // TODO: use and improve percentage or remove linkCount variable
		const percent: number|undefined = countingFinished ? processedBoxCount/boxCount * 100 : undefined
		const percentText: string = percent ? ` (${Math.round(percent*100)/100}%)` : ''
		await progressBar.set({text: buildProgressText()+percentText, percent})
	}

	function buildProgressText(): string {
		const currentBoxText = currentBox ? `, currently '${coreUtil.removeStartFromPath(startBox.getSrcPath(), currentBox.getSrcPath())}'` : '' // TODO: reduce width changes of progressBar
		return `bundling links: box ${processedBoxCount} of ${boxCount}${currentBoxText}, processed ${processedLinkCount} links`
	}
}