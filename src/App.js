import React, { useCallback, useLayoutEffect, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  addEdge,
  ConnectionLineType,
  Panel,
  useNodesState,
  useEdgesState,
  useViewport,
} from '@xyflow/react';
import dagre from 'dagre';

import { initialNodes, initialEdges } from './nodes-edges.js';

import '@xyflow/react/dist/style.css';

const nodeWidth = 172;
const nodeHeight = 36;

const getLayoutedElements = (nodes, edges, direction = 'LR') => {

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const newNode = {
      ...node,
      targetPosition: isHorizontal ? 'left' : 'top',
      sourcePosition: isHorizontal ? 'right' : 'bottom',
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };

    return newNode;
  });

  return { nodes: newNodes, edges };
};

const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
  initialNodes,
  initialEdges,
);

function deleteNodesAndEdges(setNodes, setEdges, nodeIds) {
  setEdges((prev) => {
    return prev.filter((edge) => !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target))
  })
  setNodes((prev) => {
    const newPrev = prev.map((p) => ({...p, position: {x: 0, y: 0}}))
    return newPrev.filter((node) => !nodeIds.includes(node.id))
  })
}

const LayoutFlow = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // const [nodes, setMemoizedNodes] = useState(nodes)
  // const [edges, setMemoizedEdges] = useState(edges)

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          { ...params, type: ConnectionLineType.SmoothStep, animated: true },
          eds,
        ),
      ),
    [],
  );
  const onLayout = useCallback(
    (direction) => {
      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(nodes, edges, direction);
      console.log("onLayout : ", layoutedNodes, layoutedEdges)
      setNodes([...layoutedNodes]);
      setEdges([...layoutedEdges]);
    },
    [nodes, edges],
  );

  const {zoom} = useViewport()

  const [firstCtrlPos, setFirstCtrlPos] = useState([0, 0]) // should be type [number, number]
  const [secondCtrlPos, setSecondCtrlPos] = useState([0, 0])
  const firstCtrlPosRef = useRef([0, 0])
  const secondCtrlPosRef = useRef([0, 0])
  const [isLock, setIsLock] = useState(true)
  const isCtrlClick = useRef(false)

  const [isDagreReady, setIsDagreReady] = useState(false)

  const isTopMinus = (firstCtrlPos[1]) - (secondCtrlPos[1]) < 0
  const isLeftMinus = (firstCtrlPos[0]) - (secondCtrlPos[0]) < 0

  useLayoutEffect(() => {
    function handleCtrlDown(e) {
      // Ctrl押されながらクリックされたら発火
      if ((e.ctrlKey && !e.metaKey) || (!e.ctrlKey && e.metaKey)){
        setFirstCtrlPos([e.clientX, e.clientY])
        firstCtrlPosRef.current = [e.clientX, e.clientY]
        isCtrlClick.current = true
      }
    }
    function handleCtrlMove(e) {
      if (!isCtrlClick.current) return
      setSecondCtrlPos([e.clientX, e.clientY])
      secondCtrlPosRef.current = [e.clientX, e.clientY]
    }
    window.addEventListener("mousedown", handleCtrlDown)
    window.addEventListener("mousemove", handleCtrlMove)
    return () => {
      window.removeEventListener("mousedown", handleCtrlDown)
      window.removeEventListener("mousemove", handleCtrlMove)
    }
  }, [])

  useEffect(() => {
    function handleCtrlUp(e) {
      if (!isCtrlClick.current) return
      isCtrlClick.current = false
      const compareX = [firstCtrlPosRef.current[0], secondCtrlPosRef.current[0]].sort((a, b) => a - b)
      const compareY = [firstCtrlPosRef.current[1], secondCtrlPosRef.current[1]].sort((a, b) => a - b)
      const viewport = document.getElementsByClassName("react-flow__viewport")
      let viewportX = 0, viewportY = 0
      if (viewport.length) {
        const viewportBoundingClientRect = viewport[0].getBoundingClientRect()
        viewportX = viewportBoundingClientRect.left
        viewportY = viewportBoundingClientRect.top
      }
      console.log(viewportX, viewportY, zoom)
      console.log(compareX, compareY)
      console.log(nodes)
      const intersectNodes = nodes.filter((node) => {
        const x = node.position.x * zoom + viewportX
        const y = node.position.y * zoom + viewportY
        if (compareX[0] <= x && compareX[1] >= x && compareY[0] <= y && compareY[1] >= y) {
          return true
        }
        return false
      })
      const intersectNodeIDs = intersectNodes.map((node) => {
        return node.id
      })
      console.log(intersectNodeIDs)
      let entryNodeId, endNodeId = [], endNodeCandidates = [], endNodeParent = [], endNodeNoChildNode = [];
      intersectNodes.forEach((inode) => {
        const nodeId = inode.id
        const nodeEdges = edges.filter((edge) => nodeId === edge.source || nodeId === edge.target)
        const otherNodes = intersectNodeIDs.filter((id) => id !== nodeId)
        const foundInEdges = nodeEdges.filter((edge) => otherNodes.includes(edge.source))
        const foundOutEdges = nodeEdges.filter((edge) => otherNodes.includes(edge.target))
        if (foundInEdges.length && foundOutEdges.length) {
          // we can just skip since intermediate node can be deleted without consideration
          console.log("is intermediate node : ", nodeId)
          return
        }
        if (foundInEdges.length && !foundOutEdges.length) {
          // it indicate end of block of selected nodes
          const endPointNodes = nodeEdges.filter((edge) => {
            return !foundInEdges.map((edge) => edge.source).includes(edge.source)
          })
          if (endPointNodes.length) {
            endNodeCandidates = [...endNodeCandidates, ...endPointNodes]
          } else {
            endNodeParent = [...endNodeParent, ...foundInEdges.map((edge) => edge.source)]
            endNodeNoChildNode = [...endNodeNoChildNode, nodeId]
          }
          console.log("is end node : ", nodeId, endPointNodes)
          return
        }
        if (!foundInEdges.length && foundOutEdges.length) {
          // it indicate entry point of block of selected nodes
          const entryPointNodes = nodeEdges.filter((edge) => {
            return !foundOutEdges.map((edge) => edge.source).includes(edge.source)
          })
          // normally length of entrypoint node cannot be more than 2
          if (entryPointNodes.length) {
            entryNodeId = entryPointNodes[0].source
          } else {
            // should we just throw error since it is not intended to delete root node.
          }
          console.log("is entry node : ", nodeId, entryPointNodes)
          return
        }
        if (!foundInEdges.length && !foundOutEdges.length) {
          console.log("isolated node : ", nodeId)
          // should consider case for single layer deletion
          const intersectionNodeSource = Array.from(new Set(edges
            .filter((edge) => intersectNodeIDs.includes(edge.target))
            .map((edge) => edge.source)
          ))
          if (intersectionNodeSource.length !== 1) return
          entryNodeId = intersectionNodeSource[0]
          // should consider other algorithm to choose applicable node
          const intersectionNodeTarget = edges
            .filter((edge) => intersectNodeIDs.includes(edge.source))
          endNodeId = intersectionNodeTarget.map((inodetarget) => inodetarget.target)
        }
      })
      if (endNodeCandidates.length) {
        endNodeId = endNodeCandidates.map((edge) => edge.target)
      } else if (!endNodeId.length) {
        endNodeParent = Array.from(new Set(endNodeParent))
        console.log(endNodeParent, endNodeNoChildNode)
        endNodeId = edges.filter((edge) => {
          return edge.source === endNodeParent[0] && !endNodeNoChildNode.includes(edge.target)
        }).map((edge) => edge.target)
      }
      console.log("final result : ", entryNodeId, endNodeId)
      deleteNodesAndEdges(setNodes, setEdges, intersectNodeIDs)
      endNodeId.forEach((endNodeIdchild) => {
        const edgeExists = edges.some((edge) => {
          edge.source === entryNodeId && edge.target === endNodeIdchild
        })
        if (edgeExists) return
        setEdges((edge) => addEdge({
          id: `e${entryNodeId}${endNodeIdchild}`,
          source: entryNodeId,
          target: endNodeIdchild,
          type: "smoothstep",
          animated: true
          }, edge)
        )
      })
      setFirstCtrlPos([0, 0])
      setSecondCtrlPos([0, 0])
      firstCtrlPosRef.current = [0, 0]
      secondCtrlPosRef.current = [0, 0]
      setIsDagreReady(true)
    }
    window.addEventListener("mouseup", handleCtrlUp)
    return () => {
      window.removeEventListener("mouseup", handleCtrlUp)
    }
  }, [nodes, edges])

  useEffect(() => {
    if (!isDagreReady) return
    onLayout("LR")
    setIsDagreReady(false)
  }, [isDagreReady, nodes, edges])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      connectionLineType={ConnectionLineType.SmoothStep}
      fitView
      panOnDrag={isLock}
      minZoom={1}
      maxZoom={3}
    >
      <Panel position="top-right">
        <button onClick={() => onLayout('TB')}>vertical layout</button>
        <button onClick={() => onLayout('LR')}>horizontal layout</button>
        <button onClick={() => setIsLock((prev) => !prev)}>
          {isLock ? "Lock screen" : "Unlock screen"}
        </button>
      </Panel>
      <div
        className="ctrlClickArea"
        style={{
          width: secondCtrlPos[0] ? Math.abs((firstCtrlPos[0]) - (secondCtrlPos[0])) : 0,
          height: secondCtrlPos[1] ? Math.abs((firstCtrlPos[1]) - (secondCtrlPos[1])) : 0,
          top: isTopMinus ? firstCtrlPos[1] : secondCtrlPos[1],
          left: isLeftMinus ? firstCtrlPos[0] : secondCtrlPos[0]
        }}
      >
      </div>
    </ReactFlow>
  );
};

export default LayoutFlow;
