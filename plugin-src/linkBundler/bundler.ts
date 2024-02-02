/**
 * pluginFacade not used in imports because
 * some imports could not be resolved when importing from '../dist/pluginFacade' and cause:
 * "TypeError: Class extends value undefined is not a constructor or null"
 * TODO fix this!
 */
import { AbstractNodeWidget } from '../../dist/core/AbstractNodeWidget'
import { ClientRect } from '../../dist/core/ClientRect'
import { LinkEnd } from '../../dist/core/link/LinkEnd'
import { ClientPosition } from '../../dist/core/shape/ClientPosition'
import { Box } from '../../dist/core/box/Box'
import { Link } from '../../dist/core/link/Link'
import { NodeWidget } from '../../dist/core/node/NodeWidget'
import * as commonRouteFinder from './commonRouteFinder'
import * as knotMerger from './knotMerger'

export async function bundleLink(link: Link, options?: {
	unwatchDelayInMs?: number
}): Promise<void> {
	const {route: longestCommonRoute, deepestBoxInFromPath, deepestBoxInToPath} = await commonRouteFinder.findLongestCommonRouteWithWatchers(link)

	if (longestCommonRoute && longestCommonRoute.length > 0) {
		console.log(`bundle ${link.describe()} between ${longestCommonRoute.from.getName()} and ${longestCommonRoute.to.getName()}.`)
		await bundleLinkIntoCommonRoute(link, longestCommonRoute)
	}

	if (options?.unwatchDelayInMs) {
		setTimeout(() => {
			deepestBoxInFromPath.unwatch()
			deepestBoxInToPath.unwatch()
		}, options.unwatchDelayInMs)
	} else {
		await Promise.all([
			deepestBoxInFromPath.unwatch(),
			deepestBoxInToPath.unwatch()
		])
	}
}

async function bundleLinkIntoCommonRoute(link: Link, commonRoute: {
	links: Link[]
	from: AbstractNodeWidget
	to: AbstractNodeWidget
}): Promise<void> {
	const bundleFromPart: boolean = link.getData().from.path.at(-1)?.boxId !== commonRoute.links.at(0)?.getData().from.path.at(-1)?.boxId
	const bundleToPart: boolean = link.getData().to.path.at(-1)?.boxId !== commonRoute.links.at(-1)?.getData().to.path.at(-1)?.boxId
	let fromLink: Link = link
	let toLink: Link = link
	if (bundleFromPart && bundleToPart) {
		const commonRouteToBox = commonRoute.to instanceof Box ? commonRoute.to : commonRoute.to.getParent() // TODO: introduce class 'CommonRoute' with method 'getEndBox(end: 'from'|'to'): Box'
		const commonRouteFromBox = commonRoute.from instanceof Box ? commonRoute.from : commonRoute.from.getParent()
		if (link.to.isBoxInPath(commonRouteToBox)) {
			toLink = await link.getManagingBoxLinks().addCopy(link)
		} else if (link.from.isBoxInPath(commonRouteFromBox)) {
			fromLink = await link.getManagingBoxLinks().addCopy(link)
		} else {
			console.warn(`linkBundler.bundleLinkIntoCommonRoute(link: ${link.describe()}, ..) failed to decide weather commonRoute.from or commonRoute.to is heavier`)
			return
		}
	}
	if (bundleFromPart) {
		const insertion = await bundleLinkEndIntoCommonRoute(fromLink.to, 'from', commonRoute)
		if (insertion && insertion.addedLink.getData().from.path.at(-1)?.boxId === insertion.insertedNode.getId()) {
			commonRoute.links.push(insertion.addedLink)
		}
		if (insertion) {
			//await knotMerger.mergeKnot(insertion.insertedNode) TODO test
		}
	}
	if (bundleToPart) {
		const insertion = await bundleLinkEndIntoCommonRoute(toLink.from, 'to', commonRoute)
		if (insertion) {
			//await knotMerger.mergeKnot(insertion.insertedNode) TODO test
		}
	}
	if (!bundleFromPart && !bundleToPart) {
		console.warn(`linkBundler.bundleLinkIntoCommonRoute(link: ${link.describe()}, ..) detected duplicate link`)
	}
}

async function bundleLinkEndIntoCommonRoute(linkEnd: LinkEnd, end: 'from'|'to', commonRoute: {
	links: Link[]
	from: AbstractNodeWidget
	to: AbstractNodeWidget
}): Promise<{
	insertedNode: NodeWidget, addedLink: Link
} | undefined> {
	const commonEndNode: AbstractNodeWidget = commonRoute[end]
	if (commonEndNode instanceof NodeWidget) {
		await dragAndDropLinkEnd(linkEnd, commonEndNode)
		//await knotMerger.mergeKnot(commonEndNode) TODO test
		return undefined
	}
	
	if (!(commonEndNode instanceof Box)) {
		console.warn(`linkBundler.bundleLinkEndIntoCommonRoute(...) not implemented for commonEndNode instanceof ${commonEndNode.constructor.name}`)
		return undefined
	}
	const commonEndLink: Link = commonRouteFinder.getEndLinkOfCommonRoute(commonRoute, end)
	
	const linkManagingBoxBefore: Box = commonEndLink.getManagingBox()
	const insertion: {insertedNode: NodeWidget, addedLink: Link} | undefined = await commonEndLink.getManagingBoxLinks().insertNodeIntoLink(
		commonEndLink,
		commonEndNode,
		await calculateBundleNodePosition(linkEnd.getReferenceLink(), commonEndLink, commonEndNode)
	)
	if (linkManagingBoxBefore !== commonEndLink.getManagingBox()) {
		console.warn(`linkBundler.bundleLinkEndIntoCommonRoute(..) did not expect BoxLinks::insertNodeIntoLink(link, ..) to change managingBox of link`)
	}
	await dragAndDropLinkEnd(linkEnd, insertion.insertedNode)
	return insertion
}

async function dragAndDropLinkEnd(linkEnd: LinkEnd, dropTarget: NodeWidget): Promise<void> {
	const bundleLinkNodePosition: ClientPosition = (await dropTarget.getClientShape()).getMidPosition()
	await linkEnd.dragAndDrop({dropTarget: dropTarget, clientPosition: bundleLinkNodePosition}) // TODO: do this with LocalPositions because ClientPositions may not work well when zoomed far away
}

async function calculateBundleNodePosition(link: Link, otherLink: Link, box: Box): Promise<ClientPosition> {
	const linkLine: {from: ClientPosition, to: ClientPosition} = await link.getLineInClientCoords()
	const otherLinkLine: {from: ClientPosition, to: ClientPosition} = await otherLink.getLineInClientCoords()
	const averageLine = { // TODO: include weights
		from: new ClientPosition((linkLine.from.x+otherLinkLine.from.x) / 2, (linkLine.from.y+otherLinkLine.from.y) / 2),
		to: new ClientPosition((linkLine.to.x+otherLinkLine.to.x) / 2, (linkLine.to.y+otherLinkLine.to.y) / 2)
	}
	const boxRect: ClientRect = await box.getClientRect()

	const intersections: ClientPosition[] = boxRect.calculateIntersectionsWithLine(averageLine)
	if (intersections.length !== 1) {
		console.warn(`linkBundler.calculateBundleNodePosition(..) expected exactly one intersection but are ${intersections.length}`)
	}
	return intersections.at(0) ?? boxRect.getMidPosition()
}