import {
  ProgramMemory,
  Path,
  SketchGroup,
  SourceRange,
  PathToNode,
} from '../executor'
import {
  Program,
  PipeExpression,
  CallExpression,
  VariableDeclarator,
  Value,
  Literal,
} from '../abstractSyntaxTree'
import {
  getNodeFromPath,
  getNodeFromPathCurry,
  getNodePathFromSourceRange,
} from '../queryAst'
import { lineGeo } from '../engine'
import { GuiModes, toolTips, TooTip } from '../../useStore'
import { getLastIndex } from '../modifyAst'

import {
  SketchLineHelper,
  ModifyAstBase,
  InternalFn,
  TransformCallback,
} from './stdTypes'

import {
  createLiteral,
  createCallExpression,
  createArrayExpression,
  createPipeSubstitution,
  createObjectExpression,
  mutateArrExp,
  mutateObjExpProp,
  findUniqueName,
} from '../modifyAst'
import { roundOff, getLength, getAngle } from '../../lib/utils'

export type Coords2d = [number, number]

export function getCoordsFromPaths(skGroup: SketchGroup, index = 0): Coords2d {
  const currentPath = skGroup?.value?.[index]
  if (!currentPath && skGroup?.start) {
    return skGroup.start
  } else if (!currentPath) {
    return [0, 0]
  }
  if (currentPath.type === 'toPoint') {
    return [currentPath.to[0], currentPath.to[1]]
  }
  return [0, 0]
}

export function createFirstArg(
  sketchFn: TooTip,
  val: Value | [Value, Value],
  tag?: Value
): Value {
  if (!tag) {
    if (Array.isArray(val)) {
      return createArrayExpression(val)
    }
    return val
  }
  if (Array.isArray(val)) {
    if (['line', 'lineTo'].includes(sketchFn))
      return createObjectExpression({ to: createArrayExpression(val), tag })
    if (
      ['angledLine', 'angledLineOfXLength', 'angledLineOfYLength'].includes(
        sketchFn
      )
    )
      return createObjectExpression({ angle: val[0], length: val[1], tag })
    if (['angledLineToX', 'angledLineToY'].includes(sketchFn))
      return createObjectExpression({ angle: val[0], to: val[1], tag })
  } else {
    if (['xLine', 'yLine'].includes(sketchFn))
      return createObjectExpression({ length: val, tag })
    if (['xLineTo', 'yLineTo'].includes(sketchFn))
      return createObjectExpression({ to: val, tag })
  }
  throw new Error('all sketch line types should have been covered')
}

export const lineTo: SketchLineHelper = {
  fn: (
    { sourceRange },
    data:
      | [number, number]
      | {
          to: [number, number]
          tag?: string
        },
    previousSketch: SketchGroup
  ): SketchGroup => {
    if (!previousSketch)
      throw new Error('lineTo must be called after startSketchAt')
    const sketchGroup = { ...previousSketch }
    const from = getCoordsFromPaths(sketchGroup, sketchGroup.value.length - 1)
    const to = 'to' in data ? data.to : data
    const geo = lineGeo({
      from: [...from, 0],
      to: [...to, 0],
    })
    const currentPath: Path = {
      type: 'toPoint',
      to,
      from,
      __geoMeta: {
        sourceRange,
        pathToNode: [], // TODO
        geos: [
          {
            type: 'line',
            geo: geo.line,
          },
          {
            type: 'lineEnd',
            geo: geo.tip,
          },
        ],
      },
    }
    if ('tag' in data) {
      currentPath.name = data.tag
    }
    return {
      ...sketchGroup,
      value: [...sketchGroup.value, currentPath],
    }
  },
  add: ({
    node,
    pathToNode,
    to,
    createCallback,
    replaceExisting,
    referencedSegment,
  }) => {
    const _node = { ...node }
    const { node: pipe } = getNodeFromPath<PipeExpression>(
      _node,
      pathToNode,
      'PipeExpression'
    )

    const newVals: [Value, Value] = [
      createLiteral(roundOff(to[0], 2)),
      createLiteral(roundOff(to[1], 2)),
    ]

    const newLine = createCallExpression('lineTo', [
      createArrayExpression(newVals),
      createPipeSubstitution(),
    ])
    const callIndex = getLastIndex(pathToNode)
    if (replaceExisting && createCallback) {
      const boop = createCallback(newVals, referencedSegment)
      pipe.body[callIndex] = boop.callExp
      return {
        modifiedAst: _node,
        pathToNode,
        valueUsedInTransform: boop.valueUsedInTransform,
      }
    } else {
      pipe.body = [...pipe.body, newLine]
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  updateArgs: ({ node, pathToNode, to }) => {
    const _node = { ...node }
    const { node: callExpression } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )

    const toArrExp = createArrayExpression([
      createLiteral(to[0]),
      createLiteral(to[1]),
    ])

    mutateArrExp(callExpression.arguments?.[0], toArrExp) ||
      mutateObjExpProp(callExpression.arguments?.[0], toArrExp, 'to')
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  addTag: addTagWithTo('default'),
}

export const line: SketchLineHelper = {
  fn: (
    { sourceRange, programMemory },
    data:
      | [number, number]
      | {
          to: [number, number]
          // name?: string
          tag?: string
        },
    previousSketch: SketchGroup
  ): SketchGroup => {
    if (!previousSketch) throw new Error('lineTo must be called after lineTo')
    const sketchGroup = { ...previousSketch }
    const from = getCoordsFromPaths(sketchGroup, sketchGroup.value.length - 1)
    const args = 'to' in data ? data.to : data
    const to: [number, number] = [from[0] + args[0], from[1] + args[1]]
    const geo = lineGeo({
      from: [...from, 0],
      to: [...to, 0],
    })
    const currentPath: Path = {
      type: 'toPoint',
      to,
      from,
      __geoMeta: {
        sourceRange,
        pathToNode: [], // TODO
        geos: [
          {
            type: 'line',
            geo: geo.line,
          },
          {
            type: 'lineEnd',
            geo: geo.tip,
          },
        ],
      },
    }
    if ('tag' in data) {
      currentPath.name = data.tag
    }
    return {
      ...sketchGroup,
      value: [...sketchGroup.value, currentPath],
    }
  },
  add: ({
    node,
    previousProgramMemory,
    pathToNode,
    to,
    from,
    replaceExisting,
    createCallback,
  }) => {
    const _node = { ...node }
    const { node: pipe } = getNodeFromPath<PipeExpression>(
      _node,
      pathToNode,
      'PipeExpression'
    )
    const { node: varDec } = getNodeFromPath<VariableDeclarator>(
      _node,
      pathToNode,
      'VariableDeclarator'
    )
    const variableName = varDec.id.name
    const sketch = previousProgramMemory?.root?.[variableName]
    if (sketch.type !== 'sketchGroup') throw new Error('not a sketchGroup')

    const newXVal = createLiteral(roundOff(to[0] - from[0], 2))
    const newYVal = createLiteral(roundOff(to[1] - from[1], 2))

    const newLine = createCallback
      ? createCallback([newXVal, newYVal]).callExp
      : createCallExpression('line', [
          createArrayExpression([newXVal, newYVal]),
          createPipeSubstitution(),
        ])
    const callIndex = getLastIndex(pathToNode)
    if (replaceExisting) {
      pipe.body[callIndex] = newLine
    } else {
      pipe.body = [...pipe.body, newLine]
    }

    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  updateArgs: ({ node, pathToNode, to, from }) => {
    const _node = { ...node }
    const { node: callExpression, path } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )

    const toArrExp = createArrayExpression([
      createLiteral(roundOff(to[0] - from[0], 2)),
      createLiteral(roundOff(to[1] - from[1], 2)),
    ])

    mutateArrExp(callExpression.arguments?.[0], toArrExp) ||
      mutateObjExpProp(callExpression.arguments?.[0], toArrExp, 'to')

    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  addTag: addTagWithTo('default'),
}

export const xLineTo: SketchLineHelper = {
  fn: (
    meta,
    data:
      | number
      | {
          to: number
          // name?: string
          tag?: string
        },
    previousSketch: SketchGroup
  ) => {
    if (!previousSketch) throw new Error('bad bad bad')
    const from = getCoordsFromPaths(
      previousSketch,
      previousSketch.value.length - 1
    )
    const [xVal, tag] = typeof data !== 'number' ? [data.to, data.tag] : [data]
    return lineTo.fn(meta, { to: [xVal, from[1]], tag }, previousSketch)
  },
  add: ({ node, pathToNode, to, replaceExisting, createCallback }) => {
    const _node = { ...node }
    const getNode = getNodeFromPathCurry(_node, pathToNode)
    const { node: pipe } = getNode<PipeExpression>('PipeExpression')

    const newVal = createLiteral(roundOff(to[0], 2))
    const newLine = createCallback
      ? createCallback([newVal, newVal]).callExp
      : createCallExpression('xLineTo', [newVal, createPipeSubstitution()])

    const callIndex = getLastIndex(pathToNode)
    if (replaceExisting) {
      pipe.body[callIndex] = newLine
    } else {
      pipe.body = [...pipe.body, newLine]
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  updateArgs: ({ node, pathToNode, to, from }) => {
    const _node = { ...node }
    const { node: callExpression } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )
    const newX = createLiteral(roundOff(to[0], 2))
    if (callExpression.arguments?.[0]?.type === 'Literal') {
      callExpression.arguments[0] = newX
    } else {
      mutateObjExpProp(callExpression.arguments?.[0], newX, 'to')
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  addTag: addTagWithTo('default'),
}

export const yLineTo: SketchLineHelper = {
  fn: (
    meta,
    data:
      | number
      | {
          to: number
          // name?: string
          tag?: string
        },
    previousSketch: SketchGroup
  ) => {
    if (!previousSketch) throw new Error('bad bad bad')
    const from = getCoordsFromPaths(
      previousSketch,
      previousSketch.value.length - 1
    )
    const [yVal, tag] = typeof data !== 'number' ? [data.to, data.tag] : [data]
    return lineTo.fn(meta, { to: [from[0], yVal], tag }, previousSketch)
  },
  add: ({ node, pathToNode, to, replaceExisting, createCallback }) => {
    const _node = { ...node }
    const getNode = getNodeFromPathCurry(_node, pathToNode)
    const { node: pipe } = getNode<PipeExpression>('PipeExpression')

    const newVal = createLiteral(roundOff(to[1], 2))
    const newLine = createCallback
      ? createCallback([newVal, newVal]).callExp
      : createCallExpression('yLineTo', [newVal, createPipeSubstitution()])
    const callIndex = getLastIndex(pathToNode)
    if (replaceExisting) {
      pipe.body[callIndex] = newLine
    } else {
      pipe.body = [...pipe.body, newLine]
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  updateArgs: ({ node, pathToNode, to, from }) => {
    const _node = { ...node }
    const { node: callExpression } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )
    const newY = createLiteral(roundOff(to[1], 2))
    if (callExpression.arguments?.[0]?.type === 'Literal') {
      callExpression.arguments[0] = newY
    } else {
      mutateObjExpProp(callExpression.arguments?.[0], newY, 'to')
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  addTag: addTagWithTo('default'),
}

export const xLine: SketchLineHelper = {
  fn: (
    meta,
    data:
      | number
      | {
          length: number
          tag?: string
        },
    previousSketch: SketchGroup
  ) => {
    if (!previousSketch) throw new Error('bad bad bad')
    const [xVal, tag] =
      typeof data !== 'number' ? [data.length, data.tag] : [data]
    return line.fn(meta, { to: [xVal, 0], tag }, previousSketch)
  },
  add: ({ node, pathToNode, to, from, replaceExisting, createCallback }) => {
    const _node = { ...node }
    const getNode = getNodeFromPathCurry(_node, pathToNode)
    const { node: pipe } = getNode<PipeExpression>('PipeExpression')

    const newVal = createLiteral(roundOff(to[0] - from[0], 2))
    const firstArg = newVal
    const newLine = createCallback
      ? createCallback([firstArg, firstArg]).callExp
      : createCallExpression('xLine', [firstArg, createPipeSubstitution()])
    const callIndex = getLastIndex(pathToNode)
    if (replaceExisting) {
      pipe.body[callIndex] = newLine
    } else {
      pipe.body = [...pipe.body, newLine]
    }
    return { modifiedAst: _node, pathToNode }
  },
  updateArgs: ({ node, pathToNode, to, from }) => {
    const _node = { ...node }
    const { node: callExpression } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )
    const newX = createLiteral(roundOff(to[0] - from[0], 2))
    if (callExpression.arguments?.[0]?.type === 'Literal') {
      callExpression.arguments[0] = newX
    } else {
      mutateObjExpProp(callExpression.arguments?.[0], newX, 'length')
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  addTag: addTagWithTo('length'),
}

export const yLine: SketchLineHelper = {
  fn: (
    meta,
    data:
      | number
      | {
          length: number
          // name?: string
          tag?: string
        },
    previousSketch: SketchGroup
  ) => {
    if (!previousSketch) throw new Error('bad bad bad')
    const [yVal, tag] =
      typeof data !== 'number' ? [data.length, data.tag] : [data]
    return line.fn(meta, { to: [0, yVal], tag }, previousSketch)
  },
  add: ({ node, pathToNode, to, from, replaceExisting, createCallback }) => {
    const _node = { ...node }
    const getNode = getNodeFromPathCurry(_node, pathToNode)
    const { node: pipe } = getNode<PipeExpression>('PipeExpression')
    const newVal = createLiteral(roundOff(to[1] - from[1], 2))
    const newLine = createCallback
      ? createCallback([newVal, newVal]).callExp
      : createCallExpression('yLine', [newVal, createPipeSubstitution()])
    const callIndex = getLastIndex(pathToNode)
    if (replaceExisting) {
      pipe.body[callIndex] = newLine
    } else {
      pipe.body = [...pipe.body, newLine]
    }
    return { modifiedAst: _node, pathToNode }
  },
  updateArgs: ({ node, pathToNode, to, from }) => {
    const _node = { ...node }
    const { node: callExpression } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )
    const newY = createLiteral(roundOff(to[1] - from[1], 2))
    if (callExpression.arguments?.[0]?.type === 'Literal') {
      callExpression.arguments[0] = newY
    } else {
      mutateObjExpProp(callExpression.arguments?.[0], newY, 'length')
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  addTag: addTagWithTo('length'),
}

export const angledLine: SketchLineHelper = {
  fn: (
    { sourceRange, programMemory },
    data:
      | [number, number]
      | {
          angle: number
          length: number
          tag?: string
        },
    previousSketch: SketchGroup
  ) => {
    if (!previousSketch) throw new Error('lineTo must be called after lineTo')
    const sketchGroup = { ...previousSketch }
    const from = getCoordsFromPaths(sketchGroup, sketchGroup.value.length - 1)
    const [angle, length] = 'angle' in data ? [data.angle, data.length] : data
    const to: [number, number] = [
      from[0] + length * Math.cos((angle * Math.PI) / 180),
      from[1] + length * Math.sin((angle * Math.PI) / 180),
    ]
    const geo = lineGeo({
      from: [...from, 0],
      to: [...to, 0],
    })
    const currentPath: Path = {
      type: 'toPoint',
      to,
      from,
      __geoMeta: {
        sourceRange,
        pathToNode: [], // TODO
        geos: [
          {
            type: 'line',
            geo: geo.line,
          },
          {
            type: 'lineEnd',
            geo: geo.tip,
          },
        ],
      },
    }
    if ('tag' in data) {
      currentPath.name = data.tag
    }
    return {
      ...sketchGroup,
      value: [...sketchGroup.value, currentPath],
    }
  },
  add: ({ node, pathToNode, to, from, createCallback, replaceExisting }) => {
    const _node = { ...node }
    const getNode = getNodeFromPathCurry(_node, pathToNode)
    const { node: pipe } = getNode<PipeExpression>('PipeExpression')

    const newAngleVal = createLiteral(roundOff(getAngle(from, to), 0))
    const newLengthVal = createLiteral(roundOff(getLength(from, to), 2))
    const newLine = createCallback
      ? createCallback([newAngleVal, newLengthVal]).callExp
      : createCallExpression('angledLine', [
          createArrayExpression([newAngleVal, newLengthVal]),
          createPipeSubstitution(),
        ])

    const callIndex = getLastIndex(pathToNode)
    if (replaceExisting) {
      pipe.body[callIndex] = newLine
    } else {
      pipe.body = [...pipe.body, newLine]
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  updateArgs: ({ node, pathToNode, to, from }) => {
    const _node = { ...node }
    const { node: callExpression } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )
    const angle = roundOff(getAngle(from, to), 0)
    const lineLength = roundOff(getLength(from, to), 2)

    const angleLit = createLiteral(angle)
    const lengthLit = createLiteral(lineLength)

    const firstArg = callExpression.arguments?.[0]
    if (!mutateArrExp(firstArg, createArrayExpression([angleLit, lengthLit]))) {
      mutateObjExpProp(firstArg, angleLit, 'angle')
      mutateObjExpProp(firstArg, lengthLit, 'length')
    }

    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  addTag: addTagWithTo('angleLength'),
}

export const angledLineOfXLength: SketchLineHelper = {
  fn: (
    { sourceRange, programMemory },
    data:
      | [number, number]
      | {
          angle: number
          length: number
          tag?: string
        },
    previousSketch: SketchGroup
  ) => {
    if (!previousSketch) throw new Error('lineTo must be called after lineTo')
    const [angle, length, tag] =
      'angle' in data ? [data.angle, data.length, data.tag] : data
    return line.fn(
      { sourceRange, programMemory },
      { to: getYComponent(angle, length), tag },
      previousSketch
    )
  },
  add: ({
    node,
    previousProgramMemory,
    pathToNode,
    to,
    from,
    createCallback,
    replaceExisting,
  }) => {
    const _node = { ...node }
    const { node: pipe } = getNodeFromPath<PipeExpression>(
      _node,
      pathToNode,
      'PipeExpression'
    )
    const { node: varDec } = getNodeFromPath<VariableDeclarator>(
      _node,
      pathToNode,
      'VariableDeclarator'
    )
    const variableName = varDec.id.name
    const sketch = previousProgramMemory?.root?.[variableName]
    if (sketch.type !== 'sketchGroup') throw new Error('not a sketchGroup')
    const angle = createLiteral(roundOff(getAngle(from, to), 0))
    const xLength = createLiteral(roundOff(Math.abs(from[0] - to[0]), 2) || 0.1)
    const newLine = createCallback
      ? createCallback([angle, xLength]).callExp
      : createCallExpression('angledLineOfXLength', [
          createArrayExpression([angle, xLength]),
          createPipeSubstitution(),
        ])
    const callIndex = getLastIndex(pathToNode)
    if (replaceExisting) {
      pipe.body[callIndex] = newLine
    } else {
      pipe.body = [...pipe.body, newLine]
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  updateArgs: ({ node, pathToNode, to, from }) => {
    const _node = { ...node }
    const { node: callExpression, path } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )
    const angle = roundOff(getAngle(from, to), 0)
    const xLength = roundOff(Math.abs(to[0] - from[0]), 2)

    const firstArg = callExpression.arguments?.[0]
    const adjustedXLength = isAngleLiteral(firstArg)
      ? Math.abs(xLength)
      : xLength // todo make work for variable angle > 180

    const angleLit = createLiteral(angle)
    const lengthLit = createLiteral(adjustedXLength)

    if (!mutateArrExp(firstArg, createArrayExpression([angleLit, lengthLit]))) {
      mutateObjExpProp(firstArg, angleLit, 'angle')
      mutateObjExpProp(firstArg, lengthLit, 'length')
    }

    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  addTag: addTagWithTo('angleLength'),
}

export const angledLineOfYLength: SketchLineHelper = {
  fn: (
    { sourceRange, programMemory },
    data:
      | [number, number]
      | {
          angle: number
          length: number
          tag?: string
        },
    previousSketch: SketchGroup
  ) => {
    if (!previousSketch) throw new Error('lineTo must be called after lineTo')
    const [angle, length, tag] =
      'angle' in data ? [data.angle, data.length, data.tag] : data
    return line.fn(
      { sourceRange, programMemory },
      { to: getXComponent(angle, length), tag },
      previousSketch
    )
  },
  add: ({
    node,
    previousProgramMemory,
    pathToNode,
    to,
    from,
    createCallback,
    replaceExisting,
  }) => {
    const _node = { ...node }
    const { node: pipe } = getNodeFromPath<PipeExpression>(
      _node,
      pathToNode,
      'PipeExpression'
    )
    const { node: varDec } = getNodeFromPath<VariableDeclarator>(
      _node,
      pathToNode,
      'VariableDeclarator'
    )
    const variableName = varDec.id.name
    const sketch = previousProgramMemory?.root?.[variableName]
    if (sketch.type !== 'sketchGroup') throw new Error('not a sketchGroup')

    const angle = createLiteral(roundOff(getAngle(from, to), 0))
    const yLength = createLiteral(roundOff(Math.abs(from[1] - to[1]), 2) || 0.1)
    const newLine = createCallback
      ? createCallback([angle, yLength]).callExp
      : createCallExpression('angledLineOfYLength', [
          createArrayExpression([angle, yLength]),
          createPipeSubstitution(),
        ])
    const callIndex = getLastIndex(pathToNode)
    if (replaceExisting) {
      pipe.body[callIndex] = newLine
    } else {
      pipe.body = [...pipe.body, newLine]
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  updateArgs: ({ node, pathToNode, to, from }) => {
    const _node = { ...node }
    const { node: callExpression, path } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )
    const angle = roundOff(getAngle(from, to), 0)
    const yLength = roundOff(to[1] - from[1], 2)

    const firstArg = callExpression.arguments?.[0]
    const adjustedYLength = isAngleLiteral(firstArg)
      ? Math.abs(yLength)
      : yLength // todo make work for variable angle > 180

    const angleLit = createLiteral(angle)
    const lengthLit = createLiteral(adjustedYLength)

    if (!mutateArrExp(firstArg, createArrayExpression([angleLit, lengthLit]))) {
      mutateObjExpProp(firstArg, angleLit, 'angle')
      mutateObjExpProp(firstArg, lengthLit, 'length')
    }

    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  addTag: addTagWithTo('angleLength'),
}

export const angledLineToX: SketchLineHelper = {
  fn: (
    { sourceRange, programMemory },
    data:
      | [number, number]
      | {
          angle: number
          to: number
          tag?: string
        },
    previousSketch: SketchGroup
  ) => {
    if (!previousSketch) throw new Error('lineTo must be called after lineTo')
    const from = getCoordsFromPaths(
      previousSketch,
      previousSketch.value.length - 1
    )
    const [angle, xTo, tag] =
      'angle' in data ? [data.angle, data.to, data.tag] : data
    const xComponent = xTo - from[0]
    const yComponent = xComponent * Math.tan((angle * Math.PI) / 180)
    const yTo = from[1] + yComponent
    return lineTo.fn(
      { sourceRange, programMemory },
      { to: [xTo, yTo], tag },
      previousSketch
    )
  },
  add: ({ node, pathToNode, to, from, createCallback, replaceExisting }) => {
    const _node = { ...node }
    const { node: pipe } = getNodeFromPath<PipeExpression>(
      _node,
      pathToNode,
      'PipeExpression'
    )
    const angle = createLiteral(roundOff(getAngle(from, to), 0))
    const xArg = createLiteral(roundOff(to[0], 2))
    const newLine = createCallback
      ? createCallback([angle, xArg]).callExp
      : createCallExpression('angledLineToX', [
          createArrayExpression([angle, xArg]),
          createPipeSubstitution(),
        ])
    const callIndex = getLastIndex(pathToNode)
    if (replaceExisting) {
      pipe.body[callIndex] = newLine
    } else {
      pipe.body = [...pipe.body, newLine]
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  updateArgs: ({ node, pathToNode, to, from }) => {
    const _node = { ...node }
    const { node: callExpression, path } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )
    const angle = roundOff(getAngle(from, to), 0)
    const xLength = roundOff(to[0], 2)

    const firstArg = callExpression.arguments?.[0]
    const adjustedXLength = xLength

    const angleLit = createLiteral(angle)
    const lengthLit = createLiteral(adjustedXLength)

    if (!mutateArrExp(firstArg, createArrayExpression([angleLit, lengthLit]))) {
      mutateObjExpProp(firstArg, angleLit, 'angle')
      mutateObjExpProp(firstArg, lengthLit, 'to')
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  addTag: addTagWithTo('angleTo'),
}

export const angledLineToY: SketchLineHelper = {
  fn: (
    { sourceRange, programMemory },
    data:
      | [number, number]
      | {
          angle: number
          to: number
          tag?: string
        },
    previousSketch: SketchGroup
  ) => {
    if (!previousSketch) throw new Error('lineTo must be called after lineTo')
    const from = getCoordsFromPaths(
      previousSketch,
      previousSketch.value.length - 1
    )
    const [angle, yTo, tag] =
      'angle' in data ? [data.angle, data.to, data.tag] : data
    const yComponent = yTo - from[1]
    const xComponent = yComponent / Math.tan((angle * Math.PI) / 180)
    const xTo = from[0] + xComponent
    return lineTo.fn(
      { sourceRange, programMemory },
      { to: [xTo, yTo], tag },
      previousSketch
    )
  },
  add: ({ node, pathToNode, to, from, createCallback, replaceExisting }) => {
    const _node = { ...node }
    const { node: pipe } = getNodeFromPath<PipeExpression>(
      _node,
      pathToNode,
      'PipeExpression'
    )
    const angle = createLiteral(roundOff(getAngle(from, to), 0))
    const yArg = createLiteral(roundOff(to[1], 2))
    const newLine = createCallback
      ? createCallback([angle, yArg]).callExp
      : createCallExpression('angledLineToY', [
          createArrayExpression([angle, yArg]),
          createPipeSubstitution(),
        ])
    const callIndex = getLastIndex(pathToNode)
    if (replaceExisting) {
      pipe.body[callIndex] = newLine
    } else {
      pipe.body = [...pipe.body, newLine]
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  updateArgs: ({ node, pathToNode, to, from }) => {
    const _node = { ...node }
    const { node: callExpression, path } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )
    const angle = roundOff(getAngle(from, to), 0)
    const xLength = roundOff(to[1], 2)

    const firstArg = callExpression.arguments?.[0]
    const adjustedXLength = xLength

    const angleLit = createLiteral(angle)
    const lengthLit = createLiteral(adjustedXLength)

    if (!mutateArrExp(firstArg, createArrayExpression([angleLit, lengthLit]))) {
      mutateObjExpProp(firstArg, angleLit, 'angle')
      mutateObjExpProp(firstArg, lengthLit, 'to')
    }
    return {
      modifiedAst: _node,
      pathToNode,
    }
  },
  addTag: addTagWithTo('angleTo'),
}

export const sketchLineHelperMap: { [key: string]: SketchLineHelper } = {
  line,
  lineTo,
  xLine,
  yLine,
  xLineTo,
  yLineTo,
  angledLine,
  angledLineOfXLength,
  angledLineOfYLength,
  angledLineToX,
  angledLineToY,
} as const

export function changeSketchArguments(
  node: Program,
  programMemory: ProgramMemory,
  sourceRange: SourceRange,
  args: [number, number],
  guiMode: GuiModes,
  from: [number, number]
): { modifiedAst: Program } {
  const _node = { ...node }
  const thePath = getNodePathFromSourceRange(_node, sourceRange)
  const { node: callExpression, path } = getNodeFromPath<CallExpression>(
    _node,
    thePath
  )
  if (guiMode.mode !== 'sketch') throw new Error('not in sketch mode')

  if (callExpression?.callee?.name in sketchLineHelperMap) {
    const { updateArgs } = sketchLineHelperMap[callExpression.callee.name]
    return updateArgs({
      node: _node,
      previousProgramMemory: programMemory,
      pathToNode: path,
      to: args,
      from,
    })
  }

  throw new Error('not a sketch line helper')
}

interface CreateLineFnCallArgs {
  node: Program
  programMemory: ProgramMemory
  to: [number, number]
  from: [number, number]
  fnName: TooTip
  pathToNode: PathToNode
}

export function addNewSketchLn({
  node,
  programMemory: previousProgramMemory,
  to,
  fnName,
  pathToNode,
}: Omit<CreateLineFnCallArgs, 'from'>): { modifiedAst: Program } {
  const { add } = sketchLineHelperMap[fnName]
  const { node: varDec } = getNodeFromPath<VariableDeclarator>(
    node,
    pathToNode,
    'VariableDeclarator'
  )
  const variableName = varDec.id.name
  const sketch = previousProgramMemory?.root?.[variableName]
  if (sketch.type !== 'sketchGroup') throw new Error('not a sketchGroup')
  const last = sketch.value[sketch.value.length - 1]
  const from = last.to

  return add({
    node,
    previousProgramMemory,
    pathToNode,
    to,
    from,
    replaceExisting: false,
  })
}

export function replaceSketchLine({
  node,
  programMemory,
  sourceRange,
  fnName,
  to,
  from,
  createCallback,
  referencedSegment,
}: {
  node: Program
  programMemory: ProgramMemory
  sourceRange: SourceRange
  fnName: TooTip
  to: [number, number]
  from: [number, number]
  createCallback: TransformCallback
  referencedSegment?: Path
}): { modifiedAst: Program; valueUsedInTransform?: number } {
  if (!toolTips.includes(fnName)) throw new Error('not a tooltip')
  const _node = { ...node }
  const thePath = getNodePathFromSourceRange(_node, sourceRange)

  const { add } = sketchLineHelperMap[fnName]
  const { modifiedAst, valueUsedInTransform } = add({
    node: _node,
    previousProgramMemory: programMemory,
    pathToNode: thePath,
    referencedSegment,
    to,
    from,
    replaceExisting: true,
    createCallback,
  })
  return { modifiedAst, valueUsedInTransform }
}

export function addTagForSketchOnFace(
  a: ModifyAstBase,
  expressionName: string
) {
  if (expressionName in sketchLineHelperMap) {
    const { addTag } = sketchLineHelperMap[expressionName]
    return addTag(a)
  }
  throw new Error('not a sketch line helper')
}

function isAngleLiteral(lineArugement: Value): boolean {
  return lineArugement?.type === 'ArrayExpression'
    ? lineArugement.elements[0].type === 'Literal'
    : lineArugement?.type === 'ObjectExpression'
    ? lineArugement.properties.find(({ key }) => key.name === 'angle')?.value
        .type === 'Literal'
    : false
}

type addTagFn = (a: ModifyAstBase) => { modifiedAst: Program; tag: string }

function addTagWithTo(
  argType: 'angleLength' | 'angleTo' | 'default' | 'length'
): addTagFn {
  return ({ node, pathToNode }) => {
    let tagName = findUniqueName(node, 'seg', 2)
    const _node = { ...node }
    const { node: callExpression } = getNodeFromPath<CallExpression>(
      _node,
      pathToNode
    )
    const firstArg = callExpression.arguments?.[0]
    if (firstArg.type === 'ObjectExpression') {
      const existingTagName = firstArg.properties?.find(
        (prop) => prop.key.name === 'tag'
      )
      if (!existingTagName) {
        mutateObjExpProp(
          callExpression.arguments?.[0],
          createLiteral(tagName),
          'tag'
        )
      } else {
        tagName = `${(existingTagName.value as Literal).value}`
      }
      return {
        modifiedAst: _node,
        tag: tagName,
      }
    }
    if (firstArg.type === 'ArrayExpression') {
      const objExp =
        argType === 'default'
          ? createObjectExpression({
              to: firstArg,
              tag: createLiteral(tagName),
            })
          : argType === 'angleLength'
          ? createObjectExpression({
              angle: firstArg.elements[0],
              length: firstArg.elements[1],
              tag: createLiteral(tagName),
            })
          : createObjectExpression({
              angle: firstArg.elements[0],
              to: firstArg.elements[1],
              tag: createLiteral(tagName),
            })
      callExpression.arguments[0] = objExp
      return {
        modifiedAst: _node,
        tag: tagName,
      }
    }
    if (firstArg.type === 'Literal') {
      const objExp =
        argType === 'length'
          ? createObjectExpression({
              length: firstArg,
              tag: createLiteral(tagName),
            })
          : createObjectExpression({
              to: firstArg,
              tag: createLiteral(tagName),
            })
      callExpression.arguments[0] = objExp
      return {
        modifiedAst: _node,
        tag: tagName,
      }
    }
    throw new Error('lineTo must be called with an object or array')
  }
}

export const closee: InternalFn = (
  { sourceRange, programMemory },
  sketchGroup: SketchGroup
): SketchGroup => {
  const from = getCoordsFromPaths(sketchGroup, sketchGroup.value.length - 1)
  const to = getCoordsFromPaths(sketchGroup, 0)
  const geo = lineGeo({
    from: [...from, 0],
    to: [...to, 0],
  })
  const currentPath: Path = {
    type: 'toPoint',
    to,
    from,
    __geoMeta: {
      sourceRange,
      pathToNode: [], // TODO
      geos: [
        {
          type: 'line',
          geo: geo.line,
        },
        {
          type: 'lineEnd',
          geo: geo.tip,
        },
      ],
    },
  }
  const newValue = [...sketchGroup.value]
  newValue[0] = currentPath
  return {
    ...sketchGroup,
    value: newValue,
  }
}

export const startSketchAt: InternalFn = (
  { sourceRange, programMemory },
  data:
    | [number, number]
    | {
        to: [number, number]
        // name?: string
        tag?: string
      }
): SketchGroup => {
  const to = 'to' in data ? data.to : data
  const currentPath: Path = {
    type: 'toPoint',
    to,
    from: to,
    __geoMeta: {
      sourceRange,
      pathToNode: [], // TODO
      geos: [],
    },
  }
  if ('tag' in data) {
    currentPath.name = data.tag
  }
  return {
    type: 'sketchGroup',
    start: to,
    value: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    __meta: [
      {
        sourceRange,
        pathToNode: [], // TODO
      },
    ],
  }
}

export function getYComponent(
  angleDegree: number,
  xComponent: number
): [number, number] {
  const normalisedAngle = ((angleDegree % 360) + 360) % 360 // between 0 and 360
  let yComponent = xComponent * Math.tan((normalisedAngle * Math.PI) / 180)
  const sign = normalisedAngle > 90 && normalisedAngle <= 270 ? -1 : 1
  return [sign * xComponent, sign * yComponent]
}

export function getXComponent(
  angleDegree: number,
  yComponent: number
): [number, number] {
  const normalisedAngle = ((angleDegree % 360) + 360) % 360 // between 0 and 360
  let xComponent = yComponent / Math.tan((normalisedAngle * Math.PI) / 180)
  const sign = normalisedAngle > 180 && normalisedAngle <= 360 ? -1 : 1
  return [sign * xComponent, sign * yComponent]
}

function getFirstArgValuesForXYFns(callExpression: CallExpression): {
  val: [Value, Value]
  tag?: Value
} {
  // used for lineTo, line
  const firstArg = callExpression.arguments[0]
  if (firstArg.type === 'ArrayExpression') {
    return { val: [firstArg.elements[0], firstArg.elements[1]] }
  }
  if (firstArg.type === 'ObjectExpression') {
    const to = firstArg.properties.find((p) => p.key.name === 'to')?.value
    const tag = firstArg.properties.find((p) => p.key.name === 'tag')?.value
    if (to?.type === 'ArrayExpression') {
      const [x, y] = to.elements
      return { val: [x, y], tag }
    }
  }
  throw new Error('expected ArrayExpression or ObjectExpression')
}

function getFirstArgValuesForAngleFns(callExpression: CallExpression): {
  val: [Value, Value]
  tag?: Value
} {
  // used for angledLine, angledLineOfXLength, angledLineToX, angledLineOfYLength, angledLineToY
  const firstArg = callExpression.arguments[0]
  if (firstArg.type === 'ArrayExpression') {
    return { val: [firstArg.elements[0], firstArg.elements[1]] }
  }
  if (firstArg.type === 'ObjectExpression') {
    const tag = firstArg.properties.find((p) => p.key.name === 'tag')?.value
    const angle = firstArg.properties.find((p) => p.key.name === 'angle')?.value
    const secondArgName = ['angledLineToX', 'angledLineToY'].includes(
      callExpression?.callee?.name as TooTip
    )
      ? 'to'
      : 'length'
    const length = firstArg.properties.find(
      (p) => p.key.name === secondArgName
    )?.value
    if (angle && length) {
      return { val: [angle, length], tag }
    }
  }
  throw new Error('expected ArrayExpression or ObjectExpression')
}

function getFirstArgValuesForXYLineFns(callExpression: CallExpression): {
  val: Value
  tag?: Value
} {
  // used for xLine, yLine, xLineTo, yLineTo
  const firstArg = callExpression.arguments[0]
  if (firstArg.type !== 'ObjectExpression') {
    return { val: firstArg }
  }
  const tag = firstArg.properties.find((p) => p.key.name === 'tag')?.value
  const secondArgName = ['xLineTo', 'yLineTo'].includes(
    // const secondArgName = ['xLineTo', 'yLineTo', 'angledLineToX', 'angledLineToY'].includes(
    callExpression?.callee?.name
  )
    ? 'to'
    : 'length'
  const length = firstArg.properties.find(
    (p) => p.key.name === secondArgName
  )?.value
  if (length) {
    return { val: length, tag }
  }
  throw new Error('expected ArrayExpression or ObjectExpression')
}

export function getFirstArg(callExp: CallExpression): {
  val: Value | [Value, Value]
  tag?: Value
} {
  const name = callExp?.callee?.name
  if (['lineTo', 'line'].includes(name)) {
    return getFirstArgValuesForXYFns(callExp)
  }
  if (
    [
      'angledLine',
      'angledLineOfXLength',
      'angledLineToX',
      'angledLineOfYLength',
      'angledLineToY',
    ].includes(name)
  ) {
    return getFirstArgValuesForAngleFns(callExp)
  }
  if (['xLine', 'yLine', 'xLineTo', 'yLineTo'].includes(name)) {
    return getFirstArgValuesForXYLineFns(callExp)
  }
  throw new Error('unexpected call expression')
}